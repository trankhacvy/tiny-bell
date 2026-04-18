use chrono::DateTime;

use crate::adapters::railway::types::DeploymentNode;
use crate::adapters::{Deployment, DeploymentState, Platform, Project};

pub fn map_status(raw: Option<&str>) -> DeploymentState {
    match raw.unwrap_or("").to_ascii_uppercase().as_str() {
        "QUEUED" | "INITIALIZING" | "WAITING" => DeploymentState::Queued,
        "BUILDING" | "DEPLOYING" => DeploymentState::Building,
        "SUCCESS" => DeploymentState::Ready,
        "FAILED" | "CRASHED" => DeploymentState::Error,
        "REMOVED" | "SKIPPED" => DeploymentState::Canceled,
        "" => DeploymentState::Unknown,
        _ => DeploymentState::Unknown,
    }
}

pub fn parse_ts(s: Option<&str>) -> i64 {
    s.and_then(|v| DateTime::parse_from_rfc3339(v).ok())
        .map(|d| d.timestamp_millis())
        .unwrap_or(0)
}

pub fn build_project(
    service_id: &str,
    project_name: &str,
    service_name: &str,
    account_id: &str,
) -> Project {
    Project {
        id: service_id.to_string(),
        account_id: account_id.to_string(),
        platform: Platform::Railway,
        name: format!("{project_name}/{service_name}"),
        url: None,
        framework: None,
        latest_deployment: None,
    }
}

pub fn deployment_from_node(node: DeploymentNode, project_id: &str) -> Deployment {
    let state = map_status(node.status.as_deref());
    let created_at = parse_ts(node.created_at.as_deref());
    let finished_at = match parse_ts(node.updated_at.as_deref()) {
        v if v > 0 => Some(v),
        _ => None,
    };

    let commit_message = node
        .meta
        .get("commitMessage")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let commit_sha = node
        .meta
        .get("commitHash")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let commit_author = node
        .meta
        .get("commitAuthor")
        .and_then(|v| v.as_str())
        .map(str::to_string);
    let branch = node
        .meta
        .get("branch")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    let duration_ms = finished_at.and_then(|f| {
        if f >= created_at {
            Some((f - created_at) as u64)
        } else {
            None
        }
    });

    Deployment {
        id: node.id,
        project_id: project_id.to_string(),
        state,
        environment: "production".to_string(),
        url: node.url.or(node.static_url),
        inspector_url: None,
        branch,
        commit_sha,
        commit_message,
        author_name: commit_author,
        author_avatar: None,
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
    fn status_mapping() {
        assert_eq!(map_status(Some("SUCCESS")), DeploymentState::Ready);
        assert_eq!(map_status(Some("FAILED")), DeploymentState::Error);
        assert_eq!(map_status(Some("CRASHED")), DeploymentState::Error);
        assert_eq!(map_status(Some("BUILDING")), DeploymentState::Building);
        assert_eq!(map_status(Some("DEPLOYING")), DeploymentState::Building);
        assert_eq!(map_status(Some("QUEUED")), DeploymentState::Queued);
        assert_eq!(map_status(Some("REMOVED")), DeploymentState::Canceled);
        assert_eq!(map_status(None), DeploymentState::Unknown);
    }
}
