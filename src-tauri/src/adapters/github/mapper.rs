use chrono::DateTime;

use crate::adapters::github::types::WorkflowRunDto;
use crate::adapters::{Deployment, DeploymentState};

pub fn map_run_state(status: Option<&str>, conclusion: Option<&str>) -> DeploymentState {
    match (status.unwrap_or(""), conclusion.unwrap_or("")) {
        ("queued", _) | ("waiting", _) => DeploymentState::Queued,
        ("in_progress", _) => DeploymentState::Building,
        ("completed", "success") => DeploymentState::Ready,
        ("completed", "failure") | ("completed", "timed_out") => DeploymentState::Error,
        ("completed", "cancelled") | ("completed", "skipped") | ("completed", "stale") => {
            DeploymentState::Canceled
        }
        ("completed", "action_required") => DeploymentState::Queued,
        ("completed", _) => DeploymentState::Unknown,
        _ => DeploymentState::Unknown,
    }
}

fn parse_ts(s: Option<&str>) -> i64 {
    s.and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

pub fn deployment_from_run(run: WorkflowRunDto, project_id: &str) -> Deployment {
    let state = map_run_state(run.status.as_deref(), run.conclusion.as_deref());
    let created_at = parse_ts(run.created_at.as_deref());
    let updated_at = parse_ts(run.updated_at.as_deref());
    let run_started = parse_ts(run.run_started_at.as_deref());

    let finished_at = if matches!(
        state,
        DeploymentState::Ready | DeploymentState::Error | DeploymentState::Canceled
    ) {
        Some(updated_at)
    } else {
        None
    };

    let duration_ms = finished_at.and_then(|f| {
        let start = if run_started > 0 {
            run_started
        } else {
            created_at
        };
        if f >= start {
            Some((f - start) as u64)
        } else {
            None
        }
    });

    Deployment {
        id: run.id.to_string(),
        project_id: project_id.to_string(),
        service_id: run.workflow_id.map(|id| id.to_string()),
        service_name: run.name,
        state,
        environment: run.event.unwrap_or_else(|| "push".to_string()),
        url: run.html_url.clone(),
        inspector_url: run.html_url,
        branch: run.head_branch,
        commit_sha: run.head_sha,
        commit_message: run.head_commit.and_then(|c| c.message),
        author_name: run.actor.as_ref().and_then(|a| a.login.clone()),
        author_avatar: run.actor.and_then(|a| a.avatar_url),
        created_at,
        finished_at,
        duration_ms,
        progress: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_mapping_covers_all_combos() {
        assert_eq!(
            map_run_state(Some("queued"), None),
            DeploymentState::Queued
        );
        assert_eq!(
            map_run_state(Some("waiting"), None),
            DeploymentState::Queued
        );
        assert_eq!(
            map_run_state(Some("in_progress"), None),
            DeploymentState::Building
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("success")),
            DeploymentState::Ready
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("failure")),
            DeploymentState::Error
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("timed_out")),
            DeploymentState::Error
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("cancelled")),
            DeploymentState::Canceled
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("skipped")),
            DeploymentState::Canceled
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("stale")),
            DeploymentState::Canceled
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("action_required")),
            DeploymentState::Queued
        );
        assert_eq!(
            map_run_state(Some("completed"), Some("neutral")),
            DeploymentState::Unknown
        );
        assert_eq!(map_run_state(None, None), DeploymentState::Unknown);
    }
}
