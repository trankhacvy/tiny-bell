use std::collections::HashMap;
use std::sync::RwLock;

use serde::{Deserialize, Serialize};

use crate::adapters::{Deployment, DeploymentState, Project};

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct DashboardState {
    pub projects: Vec<Project>,
    pub deployments_by_project: HashMap<String, Vec<Deployment>>,
    pub last_refreshed_at: Option<i64>,
    pub last_error: Option<String>,
    pub offline: bool,
    pub polling: bool,
}

#[derive(Debug, Clone)]
pub struct DiffEvent {
    pub project_id: String,
    pub project_name: String,
    pub deployment_id: String,
    pub previous: Option<DeploymentState>,
    pub current: DeploymentState,
}

#[derive(Debug, Default)]
pub struct Cache {
    inner: RwLock<DashboardState>,
}

impl Cache {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(DashboardState::default()),
        }
    }

    pub fn snapshot(&self) -> DashboardState {
        self.inner.read().unwrap_or_else(|p| p.into_inner()).clone()
    }

    pub fn mark_empty(&self) {
        let mut guard = self.inner.write().unwrap_or_else(|p| p.into_inner());
        guard.projects.clear();
        guard.deployments_by_project.clear();
        guard.last_error = None;
        guard.offline = false;
        guard.last_refreshed_at = Some(chrono::Utc::now().timestamp_millis());
    }

    pub fn mark_offline(&self, message: String) {
        let mut guard = self.inner.write().unwrap_or_else(|p| p.into_inner());
        guard.offline = true;
        guard.last_error = Some(message);
    }

    pub fn set_polling(&self, polling: bool) {
        let mut guard = self.inner.write().unwrap_or_else(|p| p.into_inner());
        guard.polling = polling;
    }

    pub fn replace_and_diff(&self, new_state: DashboardState) -> Vec<DiffEvent> {
        let mut guard = self.inner.write().unwrap_or_else(|p| p.into_inner());
        let prev = std::mem::take(&mut *guard);
        let mut events = Vec::new();

        for project in &new_state.projects {
            let Some(current_list) = new_state.deployments_by_project.get(&project.id) else {
                continue;
            };
            let Some(current) = current_list.first() else {
                continue;
            };
            let previous_state = prev
                .deployments_by_project
                .get(&project.id)
                .and_then(|lst| lst.iter().find(|d| d.id == current.id))
                .map(|d| d.state.clone());

            if previous_state.as_ref() != Some(&current.state) {
                events.push(DiffEvent {
                    project_id: project.id.clone(),
                    project_name: project.name.clone(),
                    deployment_id: current.id.clone(),
                    previous: previous_state,
                    current: current.state.clone(),
                });
            }
        }

        *guard = new_state;
        events
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adapters::{DeploymentState, Platform};

    fn project(id: &str, name: &str) -> Project {
        Project {
            id: id.into(),
            account_id: "acc".into(),
            platform: Platform::Vercel,
            name: name.into(),
            url: None,
            framework: None,
            latest_deployment: None,
        }
    }

    fn deployment(id: &str, project_id: &str, state: DeploymentState) -> Deployment {
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
            created_at: 0,
            finished_at: None,
            duration_ms: None,
            progress: None,
        }
    }

    #[test]
    fn first_replace_emits_diff_for_all() {
        let cache = Cache::new();
        let mut state = DashboardState::default();
        state.projects.push(project("p1", "acme"));
        state
            .deployments_by_project
            .insert("p1".into(), vec![deployment("d1", "p1", DeploymentState::Ready)]);
        let diff = cache.replace_and_diff(state);
        assert_eq!(diff.len(), 1);
        assert!(diff[0].previous.is_none());
        assert_eq!(diff[0].current, DeploymentState::Ready);
    }

    #[test]
    fn stable_state_does_not_emit_diff() {
        let cache = Cache::new();
        let mut s1 = DashboardState::default();
        s1.projects.push(project("p1", "acme"));
        s1.deployments_by_project
            .insert("p1".into(), vec![deployment("d1", "p1", DeploymentState::Ready)]);
        cache.replace_and_diff(s1.clone());
        let diff = cache.replace_and_diff(s1);
        assert!(diff.is_empty());
    }

    #[test]
    fn state_change_emits_diff() {
        let cache = Cache::new();
        let mut s1 = DashboardState::default();
        s1.projects.push(project("p1", "acme"));
        s1.deployments_by_project
            .insert("p1".into(), vec![deployment("d1", "p1", DeploymentState::Building)]);
        cache.replace_and_diff(s1);

        let mut s2 = DashboardState::default();
        s2.projects.push(project("p1", "acme"));
        s2.deployments_by_project
            .insert("p1".into(), vec![deployment("d1", "p1", DeploymentState::Ready)]);
        let diff = cache.replace_and_diff(s2);
        assert_eq!(diff.len(), 1);
        assert_eq!(diff[0].previous, Some(DeploymentState::Building));
        assert_eq!(diff[0].current, DeploymentState::Ready);
    }
}
