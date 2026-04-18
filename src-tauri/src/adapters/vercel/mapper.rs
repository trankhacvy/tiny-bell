use crate::adapters::vercel::types::{DeploymentDto, LatestDeploymentDto, ProjectDto};
use crate::adapters::{Deployment, DeploymentState, Platform, Project};

pub fn map_state(raw: Option<&str>) -> DeploymentState {
    match raw.unwrap_or("").to_ascii_uppercase().as_str() {
        "QUEUED" | "INITIALIZING" => DeploymentState::Queued,
        "BUILDING" => DeploymentState::Building,
        "READY" => DeploymentState::Ready,
        "ERROR" | "FAILED" => DeploymentState::Error,
        "CANCELED" | "CANCELLED" => DeploymentState::Canceled,
        "" => DeploymentState::Unknown,
        _ => DeploymentState::Unknown,
    }
}

fn environment_from_target(target: Option<&str>) -> String {
    match target.unwrap_or("") {
        "production" => "production".to_string(),
        "preview" => "preview".to_string(),
        other if !other.is_empty() => other.to_string(),
        _ => "preview".to_string(),
    }
}

pub fn project_from_dto(dto: ProjectDto, account_id: &str) -> Project {
    let latest = dto.latest_deployments.into_iter().next().map(|d| {
        deployment_from_latest(d, &dto.id)
    });

    Project {
        id: dto.id.clone(),
        account_id: account_id.to_string(),
        platform: Platform::Vercel,
        name: dto.name,
        url: latest.as_ref().and_then(|d| d.url.clone()),
        framework: dto.framework,
        latest_deployment: latest,
    }
}

pub fn deployment_from_dto(dto: DeploymentDto, project_id: &str) -> Deployment {
    let state = map_state(
        dto.ready_state
            .as_deref()
            .or(dto.state.as_deref()),
    );
    let created_at = dto.created_at.unwrap_or(0);
    let finished_at = dto.ready_at;
    let duration_ms = finished_at
        .and_then(|f| if f >= created_at { Some((f - created_at) as u64) } else { None });

    Deployment {
        id: dto.uid,
        project_id: project_id.to_string(),
        state,
        environment: environment_from_target(dto.target.as_deref()),
        url: dto.url.map(|u| if u.starts_with("http") { u } else { format!("https://{u}") }),
        inspector_url: dto.inspector_url,
        branch: dto.meta.commit_branch(),
        commit_sha: dto.meta.commit_sha(),
        commit_message: dto.meta.commit_message(),
        author_name: dto.meta.commit_author(),
        author_avatar: None,
        created_at,
        finished_at,
        duration_ms,
        progress: None,
    }
}

fn deployment_from_latest(dto: LatestDeploymentDto, project_id: &str) -> Deployment {
    let state = map_state(dto.ready_state.as_deref().or(dto.state.as_deref()));
    let created_at = dto.created.unwrap_or(0);
    Deployment {
        id: dto.id.unwrap_or_default(),
        project_id: project_id.to_string(),
        state,
        environment: environment_from_target(dto.target.as_deref()),
        url: dto.url.map(|u| if u.starts_with("http") { u } else { format!("https://{u}") }),
        inspector_url: None,
        branch: dto.meta.commit_branch(),
        commit_sha: dto.meta.commit_sha(),
        commit_message: dto.meta.commit_message(),
        author_name: dto.meta.commit_author(),
        author_avatar: None,
        created_at,
        finished_at: None,
        duration_ms: None,
        progress: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_mapping_covers_known_values() {
        assert_eq!(map_state(Some("QUEUED")), DeploymentState::Queued);
        assert_eq!(map_state(Some("INITIALIZING")), DeploymentState::Queued);
        assert_eq!(map_state(Some("BUILDING")), DeploymentState::Building);
        assert_eq!(map_state(Some("READY")), DeploymentState::Ready);
        assert_eq!(map_state(Some("ERROR")), DeploymentState::Error);
        assert_eq!(map_state(Some("CANCELED")), DeploymentState::Canceled);
        assert_eq!(map_state(Some("weird")), DeploymentState::Unknown);
        assert_eq!(map_state(None), DeploymentState::Unknown);
    }

    #[test]
    fn environment_defaults_to_preview() {
        assert_eq!(environment_from_target(None), "preview");
        assert_eq!(environment_from_target(Some("production")), "production");
        assert_eq!(environment_from_target(Some("staging")), "staging");
    }
}
