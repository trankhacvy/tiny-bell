use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use once_cell::sync::OnceCell;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::sync::mpsc;
use tokio::sync::Semaphore;
use tokio::task::JoinSet;

use crate::adapters::registry::AdapterRegistry;
use crate::cache::{Cache, DashboardState};
use crate::tray::HealthLevel;

pub const DEFAULT_INTERVAL_SECS: u64 = 15;
const ERROR_WINDOW_MS: i64 = 30 * 60 * 1000;

pub struct Poller<R: Runtime> {
    app: AppHandle<R>,
    registry: Arc<AdapterRegistry>,
    cache: Arc<Cache>,
    interval_secs: AtomicU64,
    force_tx: mpsc::Sender<()>,
    force_rx: tokio::sync::Mutex<mpsc::Receiver<()>>,
    first_poll_done: AtomicBool,
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
        self.registry.hydrate(&accounts);

        let adapters = self.registry.all();

        if adapters.is_empty() {
            self.cache.mark_empty();
            let _ = self.app.emit("dashboard:update", self.cache.snapshot());
            crate::tray::set_health(&self.app, HealthLevel::Gray);
            self.first_poll_done.store(true, Ordering::Relaxed);
            return;
        }

        let sem = Arc::new(Semaphore::new(4));
        let mut set: JoinSet<Option<AccountResult>> = JoinSet::new();
        for adapter in adapters {
            let sem = sem.clone();
            let adapter = adapter.clone();
            set.spawn(async move {
                let _permit = sem.acquire_owned().await.ok()?;
                let projects = match adapter.list_projects().await {
                    Ok(p) => p,
                    Err(e) => {
                        log::warn!("list_projects failed: {e}");
                        return None;
                    }
                };
                let inner_sem = Arc::new(Semaphore::new(4));
                let mut deps_set: JoinSet<Option<(String, Vec<crate::adapters::Deployment>)>> =
                    JoinSet::new();
                for project in &projects {
                    let adapter = adapter.clone();
                    let inner_sem = inner_sem.clone();
                    let project_id = project.id.clone();
                    deps_set.spawn(async move {
                        let _permit = inner_sem.acquire_owned().await.ok()?;
                        match adapter.list_deployments(&project_id, 10).await {
                            Ok(ds) => Some((project_id, ds)),
                            Err(e) => {
                                log::warn!("list_deployments({project_id}) failed: {e}");
                                None
                            }
                        }
                    });
                }

                let mut deps_map = Vec::new();
                while let Some(res) = deps_set.join_next().await {
                    if let Ok(Some(pair)) = res {
                        deps_map.push(pair);
                    }
                }

                Some(AccountResult {
                    projects,
                    deployments: deps_map,
                })
            });
        }

        let mut state = DashboardState::default();
        while let Some(res) = set.join_next().await {
            if let Ok(Some(acc)) = res {
                state.projects.extend(acc.projects);
                for (pid, deps) in acc.deployments {
                    state.deployments_by_project.insert(pid, deps);
                }
            }
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
    projects: Vec<crate::adapters::Project>,
    deployments: Vec<(String, Vec<crate::adapters::Deployment>)>,
}

pub fn health_from_state(state: &DashboardState) -> HealthLevel {
    if state.projects.is_empty() {
        return HealthLevel::Gray;
    }
    let now = chrono::Utc::now().timestamp_millis();
    let mut has_error = false;
    let mut has_active = false;
    for (_, deps) in &state.deployments_by_project {
        if let Some(d) = deps.first() {
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
        s.deployments_by_project.insert(
            "p1".into(),
            vec![deployment("d1", "p1", DeploymentState::Ready, chrono::Utc::now().timestamp_millis())],
        );
        assert!(matches!(health_from_state(&s), HealthLevel::Green));
    }

    #[test]
    fn health_yellow_when_building() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.deployments_by_project.insert(
            "p1".into(),
            vec![deployment("d1", "p1", DeploymentState::Building, chrono::Utc::now().timestamp_millis())],
        );
        assert!(matches!(health_from_state(&s), HealthLevel::Yellow));
    }

    #[test]
    fn health_red_when_recent_error() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.deployments_by_project.insert(
            "p1".into(),
            vec![deployment("d1", "p1", DeploymentState::Error, chrono::Utc::now().timestamp_millis())],
        );
        assert!(matches!(health_from_state(&s), HealthLevel::Red));
    }

    #[test]
    fn health_green_when_error_is_old() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        let old = chrono::Utc::now().timestamp_millis() - (60 * 60 * 1000);
        s.deployments_by_project.insert(
            "p1".into(),
            vec![deployment("d1", "p1", DeploymentState::Error, old)],
        );
        assert!(matches!(health_from_state(&s), HealthLevel::Green));
    }

    #[test]
    fn red_takes_precedence_over_yellow() {
        let mut s = DashboardState::default();
        s.projects.push(project("p1"));
        s.projects.push(project("p2"));
        let now = chrono::Utc::now().timestamp_millis();
        s.deployments_by_project.insert(
            "p1".into(),
            vec![deployment("d1", "p1", DeploymentState::Error, now)],
        );
        s.deployments_by_project.insert(
            "p2".into(),
            vec![deployment("d2", "p2", DeploymentState::Building, now)],
        );
        assert!(matches!(health_from_state(&s), HealthLevel::Red));
    }
}
