use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::mpsc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::adapters::registry::AdapterRegistry;
use crate::adapters::AdapterError;
use crate::cache::{Cache, DashboardState};
use crate::store::{self, AccountHealth};
use crate::tray::HealthLevel;

pub const DEFAULT_INTERVAL_SECS: u64 = 15;
pub const PROJECTS_REFRESH_SECS: u64 = 5 * 60;
const ERROR_WINDOW_MS: i64 = 30 * 60 * 1000;
const DEPLOYMENTS_LIMIT: usize = 100;

pub struct Poller<R: Runtime> {
    app: AppHandle<R>,
    registry: Arc<AdapterRegistry>,
    cache: Arc<Cache>,
    interval_secs: AtomicU64,
    force_tx: mpsc::Sender<()>,
    force_rx: tokio::sync::Mutex<mpsc::Receiver<()>>,
    first_poll_done: AtomicBool,
    cooldowns: Arc<Mutex<HashMap<String, Instant>>>,
    projects_last_fetched: Mutex<HashMap<String, Instant>>,
    projects_cache: Mutex<HashMap<String, Vec<crate::adapters::Project>>>,
}

impl<R: Runtime> std::fmt::Debug for Poller<R> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Poller")
            .field("interval", &self.interval_secs.load(Ordering::Relaxed))
            .finish()
    }
}

impl<R: Runtime> Poller<R> {
    pub fn new(app: AppHandle<R>, registry: Arc<AdapterRegistry>, cache: Arc<Cache>) -> Arc<Self> {
        let (tx, rx) = mpsc::channel::<()>(8);
        Arc::new(Self {
            app,
            registry,
            cache,
            interval_secs: AtomicU64::new(DEFAULT_INTERVAL_SECS),
            force_tx: tx,
            force_rx: tokio::sync::Mutex::new(rx),
            first_poll_done: AtomicBool::new(false),
            cooldowns: Arc::new(Mutex::new(HashMap::new())),
            projects_last_fetched: Mutex::new(HashMap::new()),
            projects_cache: Mutex::new(HashMap::new()),
        })
    }

    pub fn force_refresh(self: &Arc<Self>) {
        let _ = self.force_tx.try_send(());
    }

    pub fn set_interval_secs(self: &Arc<Self>, secs: u64) {
        self.interval_secs
            .store(secs.clamp(5, 600), Ordering::Relaxed);
    }

    pub fn current_interval_secs(&self) -> u64 {
        self.interval_secs.load(Ordering::Relaxed)
    }

    pub fn is_first_poll(&self) -> bool {
        !self.first_poll_done.load(Ordering::Relaxed)
    }

    pub fn spawn(self: Arc<Self>) {
        let me = self.clone();
        tauri::async_runtime::spawn(async move {
            me.cache.set_polling(true);
            crate::tray::set_health(&me.app, crate::tray::HealthLevel::Syncing);
            me.poll_once().await;
            loop {
                let interval = me.interval_secs.load(Ordering::Relaxed).max(5);
                let mut rx = me.force_rx.lock().await;
                tokio::select! {
                    _ = tokio::time::sleep(Duration::from_secs(interval)) => {}
                    _ = rx.recv() => {}
                }
                drop(rx);
                me.poll_once().await;
            }
        });
    }

    fn should_refresh_projects(&self, account_id: &str) -> bool {
        let guard = self
            .projects_last_fetched
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        match guard.get(account_id) {
            Some(t) => t.elapsed() >= Duration::from_secs(PROJECTS_REFRESH_SECS),
            None => true,
        }
    }

    fn cached_projects(&self, account_id: &str) -> Option<Vec<crate::adapters::Project>> {
        let guard = self
            .projects_cache
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        guard.get(account_id).cloned()
    }

    fn invalidate_projects_cache(&self) {
        self.projects_last_fetched
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
        self.projects_cache
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .clear();
    }

    fn store_projects(&self, account_id: &str, projects: Vec<crate::adapters::Project>) {
        {
            let mut guard = self
                .projects_last_fetched
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            guard.insert(account_id.to_string(), Instant::now());
        }
        let mut guard = self
            .projects_cache
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        guard.insert(account_id.to_string(), projects);
    }

    async fn poll_once(self: &Arc<Self>) {
        if let Err(e) = crate::keychain::ensure_loaded() {
            log::warn!("keychain unavailable: {e}");
            self.cache.mark_offline(e.to_string());
            let _ = self.app.emit("dashboard:update", self.cache.snapshot());
            crate::tray::set_health(&self.app, HealthLevel::Gray);
            self.first_poll_done.store(true, Ordering::Relaxed);
            return;
        }

        let accounts = crate::store::list_accounts(&self.app).unwrap_or_default();
        self.registry.hydrate(&accounts).await;

        let adapters = self.registry.all();

        if adapters.is_empty() {
            self.cache.mark_empty();
            let _ = self.app.emit("dashboard:update", self.cache.snapshot());
            crate::tray::set_health(&self.app, HealthLevel::Gray);
            self.first_poll_done.store(true, Ordering::Relaxed);
            return;
        }

        let prev_snapshot = self.cache.snapshot();
        let now = Instant::now();

        let sem = Arc::new(Semaphore::new(4));
        let mut set: JoinSet<AccountResult> = JoinSet::new();
        for adapter in adapters {
            let sem = sem.clone();
            let adapter = adapter.clone();
            let account_id = adapter.account_id().to_string();
            let cooldown_until = {
                let guard = self.cooldowns.lock().unwrap_or_else(|p| p.into_inner());
                guard.get(&account_id).copied()
            };
            if let Some(until) = cooldown_until {
                if until > now {
                    let remaining = until.saturating_duration_since(now).as_secs();
                    log::info!(
                        "account {account_id} in cooldown for {remaining}s — reusing cached data"
                    );
                    set.spawn(async move {
                        AccountResult {
                            account_id,
                            health_signal: None,
                            reuse_prev: true,
                            rate_limited_secs: None,
                            projects: Vec::new(),
                            deployments: Vec::new(),
                        }
                    });
                    continue;
                }
            }

            let should_refresh_projects = self.should_refresh_projects(&account_id);
            let cached_projects = self.cached_projects(&account_id);
            let me = self.clone();

            set.spawn(async move {
                let Ok(_permit) = sem.acquire_owned().await else {
                    return AccountResult {
                        account_id,
                        health_signal: None,
                        reuse_prev: true,
                        rate_limited_secs: None,
                        projects: Vec::new(),
                        deployments: Vec::new(),
                    };
                };

                let projects = if should_refresh_projects || cached_projects.is_none() {
                    match adapter.list_projects().await {
                        Ok(p) => {
                            me.store_projects(&account_id, p.clone());
                            p
                        }
                        Err(AdapterError::Unauthorized) => {
                            log::warn!("list_projects unauthorized for {account_id}");
                            return AccountResult {
                                account_id,
                                health_signal: Some(AccountHealth::NeedsReauth),
                                reuse_prev: false,
                                rate_limited_secs: None,
                                projects: Vec::new(),
                                deployments: Vec::new(),
                            };
                        }
                        Err(AdapterError::RateLimited(secs)) => {
                            log::warn!("list_projects rate limited for {account_id} — {secs}s");
                            return AccountResult {
                                account_id,
                                health_signal: None,
                                reuse_prev: true,
                                rate_limited_secs: Some(secs),
                                projects: Vec::new(),
                                deployments: Vec::new(),
                            };
                        }
                        Err(e) => {
                            log::warn!("list_projects failed: {e}");
                            if let Some(cached) = cached_projects {
                                cached
                            } else {
                                return AccountResult {
                                    account_id,
                                    health_signal: None,
                                    reuse_prev: true,
                                    rate_limited_secs: None,
                                    projects: Vec::new(),
                                    deployments: Vec::new(),
                                };
                            }
                        }
                    }
                } else {
                    cached_projects.unwrap_or_default()
                };

                let deployments = match adapter.list_recent_deployments(None, DEPLOYMENTS_LIMIT).await {
                    Ok(d) => d,
                    Err(AdapterError::Unauthorized) => {
                        log::warn!("list_recent_deployments unauthorized for {account_id}");
                        return AccountResult {
                            account_id,
                            health_signal: Some(AccountHealth::NeedsReauth),
                            reuse_prev: false,
                            rate_limited_secs: None,
                            projects: Vec::new(),
                            deployments: Vec::new(),
                        };
                    }
                    Err(AdapterError::RateLimited(secs)) => {
                        log::warn!(
                            "list_recent_deployments rate limited for {account_id} — {secs}s"
                        );
                        return AccountResult {
                            account_id,
                            health_signal: None,
                            reuse_prev: true,
                            rate_limited_secs: Some(secs),
                            projects: Vec::new(),
                            deployments: Vec::new(),
                        };
                    }
                    Err(e) => {
                        log::warn!("list_recent_deployments failed: {e}");
                        return AccountResult {
                            account_id,
                            health_signal: None,
                            reuse_prev: true,
                            rate_limited_secs: None,
                            projects: Vec::new(),
                            deployments: Vec::new(),
                        };
                    }
                };

                AccountResult {
                    account_id,
                    health_signal: Some(AccountHealth::Ok),
                    reuse_prev: false,
                    rate_limited_secs: None,
                    projects,
                    deployments,
                }
            });
        }

        let mut state = DashboardState::default();
        let mut health_updates: Vec<(String, AccountHealth)> = Vec::new();
        let mut new_cooldowns: Vec<(String, Instant)> = Vec::new();
        while let Some(res) = set.join_next().await {
            if let Ok(acc) = res {
                if acc.reuse_prev {
                    copy_account_from_prev(&acc.account_id, &prev_snapshot, &mut state);
                    if let Some(secs) = acc.rate_limited_secs {
                        new_cooldowns.push((
                            acc.account_id.clone(),
                            Instant::now() + Duration::from_secs(secs.max(1)),
                        ));
                    }
                } else {
                    state.projects.extend(acc.projects);
                    state.deployments.extend(acc.deployments);
                }
                if let Some(signal) = acc.health_signal {
                    health_updates.push((acc.account_id, signal));
                }
            }
        }

        state.deployments.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let rate_limited = {
            let now = Instant::now();
            let mut guard = self
                .cooldowns
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            // Fold in newly-rate-limited accounts from this cycle.
            for (aid, until) in new_cooldowns {
                guard.insert(aid, until);
            }
            // Drop any expired cooldowns so the map doesn't grow forever.
            guard.retain(|_, until| *until > now);
            !guard.is_empty()
        };
        state.rate_limited = rate_limited;

        let mut any_health_changed = false;
        for (account_id, signal) in health_updates {
            let prev = accounts.iter().find(|a| a.id == account_id).map(|a| a.health);
            if prev != Some(signal) {
                let _ = store::update_account(&self.app, &account_id, |a| {
                    a.health = signal;
                });
                any_health_changed = true;
            }
        }
        if any_health_changed {
            let _ = self.app.emit("accounts:changed", ());
        }
        state.last_refreshed_at = Some(chrono::Utc::now().timestamp_millis());
        state.polling = true;

        let is_first = self.is_first_poll();
        let diff = self.cache.replace_and_diff(state.clone());
        let _ = self.app.emit("dashboard:update", self.cache.snapshot());

        let health = health_from_state(&state);
        crate::tray::set_health(&self.app, health);

        if !is_first {
            crate::notifications::fire_for_diff(&self.app, &diff);
        }
        self.first_poll_done.store(true, Ordering::Relaxed);
    }
}

struct AccountResult {
    account_id: String,
    health_signal: Option<AccountHealth>,
    reuse_prev: bool,
    rate_limited_secs: Option<u64>,
    projects: Vec<crate::adapters::Project>,
    deployments: Vec<crate::adapters::Deployment>,
}

fn copy_account_from_prev(
    account_id: &str,
    prev: &DashboardState,
    state: &mut DashboardState,
) {
    let project_ids: std::collections::HashSet<String> = prev
        .projects
        .iter()
        .filter(|p| p.account_id == account_id)
        .map(|p| p.id.clone())
        .collect();
    for project in &prev.projects {
        if project.account_id == account_id {
            state.projects.push(project.clone());
        }
    }
    for dep in &prev.deployments {
        if project_ids.contains(&dep.project_id) {
            state.deployments.push(dep.clone());
        }
    }
}

pub fn health_from_state(state: &DashboardState) -> HealthLevel {
    if state.projects.is_empty() {
        return HealthLevel::Gray;
    }
    let now = chrono::Utc::now().timestamp_millis();
    let mut has_error = false;
    let mut has_active = false;

    let mut seen_projects: std::collections::HashSet<&String> = std::collections::HashSet::new();
    for d in &state.deployments {
        if !seen_projects.insert(&d.project_id) {
            continue;
        }
        match d.state {
            crate::adapters::DeploymentState::Error => {
                if d.created_at >= now - ERROR_WINDOW_MS {
                    has_error = true;
                }
            }
            crate::adapters::DeploymentState::Building
            | crate::adapters::DeploymentState::Queued => {
                has_active = true;
            }
            _ => {}
        }
    }
    if has_error {
        HealthLevel::Red
    } else if has_active {
        HealthLevel::Yellow
    } else {
        HealthLevel::Green
    }
}

static STARTED: OnceCell<()> = OnceCell::new();

pub fn ensure_started<R: Runtime>(app: &AppHandle<R>) {
    if STARTED.get().is_some() {
        return;
    }
    let Some(registry) = app.try_state::<Arc<AdapterRegistry>>() else {
        return;
    };
    let Some(cache) = app.try_state::<Arc<Cache>>() else {
        return;
    };
    let poller = Poller::new(app.clone(), registry.inner().clone(), cache.inner().clone());
    app.manage(poller.clone());
    poller.spawn();
    let _ = STARTED.set(());
}

pub fn force_refresh<R: Runtime>(app: &AppHandle<R>) {
    if let Some(p) = app.try_state::<Arc<Poller<R>>>() {
        p.inner().force_refresh();
    }
}

/// Drop every cached project list. Called whenever the adapter registry is
/// rebuilt (account added/removed/enabled/disabled, GitHub monitored_repos
/// edited, etc.) so the next `poll_once` calls `list_projects` on the fresh
/// adapter instead of reusing a snapshot that might not match the new config.
pub fn invalidate_projects<R: Runtime>(app: &AppHandle<R>) {
    if let Some(p) = app.try_state::<Arc<Poller<R>>>() {
        p.inner().invalidate_projects_cache();
    }
}

pub fn set_interval_secs<R: Runtime>(app: &AppHandle<R>, secs: u64) {
    if let Some(p) = app.try_state::<Arc<Poller<R>>>() {
        p.inner().set_interval_secs(secs);
    }
}

pub fn current_interval_secs<R: Runtime>(app: &AppHandle<R>) -> u64 {
    app.try_state::<Arc<Poller<R>>>()
        .map(|p| p.inner().current_interval_secs())
        .unwrap_or(DEFAULT_INTERVAL_SECS)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::{Deployment, DeploymentState, Platform, Project};

    fn project(id: &str) -> Project {
        Project {
            id: id.into(),
            account_id: "acc".into(),
            platform: Platform::Vercel,
            name: id.into(),
            url: None,
            framework: None,
            latest_deployment: None,
        }
    }

    fn deployment(id: &str, project_id: &str, state: DeploymentState, created_at: i64) -> Deployment {
        Deployment {
            id: id.into(),
            project_id: project_id.into(),
            service_id: None,
            service_name: None,
            state,
            environment: "production".into(),
            url: None,
            inspector_url: None,
            branch: None,
            commit_sha: None,
            commit_message: None,
            author_name: None,
            author_avatar: None,
            created_at,
            finished_at: None,
            duration_ms: None,
            progress: None,
        }
    }

    #[test]
    fn health_gray_when_empty() {
        let s = DashboardState::default();
        assert!(matches!(health_from_state(&s), HealthLevel::Gray));
    }

    #[test]
    fn health_green_when_all_ready() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.deployments.push(deployment(
            "d1",
            "p1",
            DeploymentState::Ready,
            chrono::Utc::now().timestamp_millis(),
        ));
        assert!(matches!(health_from_state(&s), HealthLevel::Green));
    }

    #[test]
    fn health_yellow_when_building() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.deployments.push(deployment(
            "d1",
            "p1",
            DeploymentState::Building,
            chrono::Utc::now().timestamp_millis(),
        ));
        assert!(matches!(health_from_state(&s), HealthLevel::Yellow));
    }

    #[test]
    fn health_red_when_recent_error() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.deployments.push(deployment(
            "d1",
            "p1",
            DeploymentState::Error,
            chrono::Utc::now().timestamp_millis(),
        ));
        assert!(matches!(health_from_state(&s), HealthLevel::Red));
    }

    #[test]
    fn health_green_when_error_is_old() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        let old = chrono::Utc::now().timestamp_millis() - (60 * 60 * 1000);
        s.deployments
            .push(deployment("d1", "p1", DeploymentState::Error, old));
        assert!(matches!(health_from_state(&s), HealthLevel::Green));
    }

    #[test]
    fn red_takes_precedence_over_yellow() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.projects.push(project("p2"));
        let now = chrono::Utc::now().timestamp_millis();
        s.deployments
            .push(deployment("d1", "p1", DeploymentState::Error, now));
        s.deployments
            .push(deployment("d2", "p2", DeploymentState::Building, now));
        assert!(matches!(health_from_state(&s), HealthLevel::Red));
    }
}
