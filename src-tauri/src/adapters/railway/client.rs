use std::collections::HashMap;

use serde::Serialize;

use crate::adapters::r#trait::AdapterError;
use crate::adapters::railway::mapper::{build_project, deployment_from_node};
use crate::adapters::railway::types::{
    DeploymentConnection, GraphqlResponse, MeProjectsData,
};
use crate::adapters::{Deployment, Project};

const PROJECTS_QUERY: &str = r#"query Projects {
  me {
    workspaces {
      id
      name
      projects {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  }
}"#;

const BATCH_DEPLOYMENT_FIELDS: &str = r#"edges {
  node {
    id
    status
    createdAt
    updatedAt
    url
    staticUrl
    meta
    service { id name }
  }
}"#;

#[derive(Serialize)]
struct GraphqlRequest<'a, V: Serialize> {
    query: &'a str,
    variables: V,
}

pub async fn graphql<T: for<'de> serde::Deserialize<'de>, V: Serialize>(
    http: &reqwest::Client,
    url: &str,
    token: &str,
    query: &str,
    variables: V,
) -> Result<T, AdapterError> {
    let req = GraphqlRequest { query, variables };
    let res = http
        .post(url)
        .bearer_auth(token)
        .json(&req)
        .send()
        .await
        .map_err(AdapterError::from)?;

    let status = res.status();
    if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
        return Err(AdapterError::Unauthorized);
    }
    if status == reqwest::StatusCode::TOO_MANY_REQUESTS {
        return Err(AdapterError::RateLimited(60));
    }

    let body: GraphqlResponse<T> = res
        .error_for_status()
        .map_err(|e| AdapterError::Platform(e.to_string()))?
        .json()
        .await
        .map_err(AdapterError::from)?;

    if let Some(errs) = body.errors {
        if let Some(first) = errs.first() {
            return Err(AdapterError::Platform(first.message.clone()));
        }
    }
    body.data
        .ok_or_else(|| AdapterError::Platform("empty data".into()))
}

pub async fn fetch_projects(
    http: &reqwest::Client,
    url: &str,
    token: &str,
    workspace_filter: Option<&str>,
    account_id: &str,
) -> Result<Vec<Project>, AdapterError> {
    let data: MeProjectsData = graphql(http, url, token, PROJECTS_QUERY, serde_json::json!({}))
        .await?;

    let mut out = Vec::new();
    for ws in data.me.workspaces {
        if let Some(filter) = workspace_filter {
            if ws.id != filter {
                continue;
            }
        }
        for pe in ws.projects.edges {
            out.push(build_project(&pe.node.id, &pe.node.name, account_id));
        }
    }
    Ok(out)
}

pub async fn fetch_recent_deployments(
    http: &reqwest::Client,
    url: &str,
    token: &str,
    project_ids: &[String],
    per_project_limit: usize,
) -> Result<Vec<Deployment>, AdapterError> {
    if project_ids.is_empty() {
        return Ok(Vec::new());
    }

    let mut query = String::from("query BatchDeployments {\n");
    for (idx, pid) in project_ids.iter().enumerate() {
        let escaped = pid.replace('\\', "\\\\").replace('"', "\\\"");
        query.push_str(&format!(
            "  p{idx}: deployments(first: {per_project_limit}, input: {{ projectId: \"{escaped}\" }}) {{ {BATCH_DEPLOYMENT_FIELDS} }}\n"
        ));
    }
    query.push('}');

    let data: HashMap<String, Option<DeploymentConnection>> =
        graphql(http, url, token, &query, serde_json::json!({})).await?;

    let mut out = Vec::new();
    for (idx, pid) in project_ids.iter().enumerate() {
        let alias = format!("p{idx}");
        if let Some(Some(conn)) = data.get(&alias) {
            for edge in &conn.edges {
                out.push(deployment_from_node(clone_deployment_node(&edge.node), pid));
            }
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

fn clone_deployment_node(
    node: &crate::adapters::railway::types::DeploymentNode,
) -> crate::adapters::railway::types::DeploymentNode {
    crate::adapters::railway::types::DeploymentNode {
        id: node.id.clone(),
        status: node.status.clone(),
        created_at: node.created_at.clone(),
        updated_at: node.updated_at.clone(),
        url: node.url.clone(),
        static_url: node.static_url.clone(),
        meta: node.meta.clone(),
        service: node.service.as_ref().map(|s| {
            crate::adapters::railway::types::DeploymentServiceRef {
                id: s.id.clone(),
                name: s.name.clone(),
            }
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    #[tokio::test]
    async fn fetches_projects_flattens_workspaces() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "me": {
                        "workspaces": [
                            {
                                "id": "ws_1",
                                "name": "personal",
                                "projects": {
                                    "edges": [
                                        { "node": { "id": "prj_1", "name": "api" } },
                                        { "node": { "id": "prj_2", "name": "worker" } }
                                    ]
                                }
                            }
                        ]
                    }
                }
            })))
            .mount(&server)
            .await;

        let url = format!("{}/graphql/v2", server.uri());
        let http = reqwest::Client::new();
        let projects = fetch_projects(&http, &url, "tok", None, "acc_1").await.unwrap();
        assert_eq!(projects.len(), 2);
        assert_eq!(projects[0].name, "api");
        assert_eq!(projects[0].id, "prj_1");
        assert_eq!(projects[1].name, "worker");
    }

    #[tokio::test]
    async fn fetches_recent_deployments_batch() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "p0": {
                        "edges": [
                            {
                                "node": {
                                    "id": "dep_1",
                                    "status": "SUCCESS",
                                    "createdAt": "2026-04-18T10:00:00Z",
                                    "updatedAt": "2026-04-18T10:01:00Z",
                                    "url": "https://api.up.railway.app",
                                    "staticUrl": null,
                                    "meta": {
                                        "commitMessage": "Fix build issues",
                                        "commitHash": "abc1234",
                                        "commitAuthor": "rajat",
                                        "branch": "next"
                                    },
                                    "service": { "id": "svc_web", "name": "web" }
                                }
                            },
                            {
                                "node": {
                                    "id": "dep_2",
                                    "status": "BUILDING",
                                    "createdAt": "2026-04-18T11:00:00Z",
                                    "updatedAt": "2026-04-18T11:00:10Z",
                                    "url": null,
                                    "staticUrl": null,
                                    "meta": {},
                                    "service": { "id": "svc_worker", "name": "worker" }
                                }
                            }
                        ]
                    }
                }
            })))
            .mount(&server)
            .await;

        let url = format!("{}/graphql/v2", server.uri());
        let http = reqwest::Client::new();
        let deps = fetch_recent_deployments(&http, &url, "tok", &["prj_1".into()], 50)
            .await
            .unwrap();
        assert_eq!(deps.len(), 2);
        assert_eq!(deps[0].id, "dep_2");
        assert_eq!(deps[0].service_id.as_deref(), Some("svc_worker"));
        assert_eq!(deps[0].service_name.as_deref(), Some("worker"));
        assert_eq!(deps[1].id, "dep_1");
        assert_eq!(deps[1].service_name.as_deref(), Some("web"));
    }

    #[tokio::test]
    async fn graphql_errors_surface() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "errors": [{ "message": "Problem processing request" }]
            })))
            .mount(&server)
            .await;

        let url = format!("{}/graphql/v2", server.uri());
        let http = reqwest::Client::new();
        let err = fetch_projects(&http, &url, "tok", None, "acc_1").await.unwrap_err();
        assert!(matches!(err, AdapterError::Platform(ref m) if m.contains("Problem")));
    }

    #[tokio::test]
    async fn unauthorized_surfaces() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(401))
            .mount(&server)
            .await;

        let url = format!("{}/graphql/v2", server.uri());
        let http = reqwest::Client::new();
        let err = fetch_projects(&http, &url, "tok", None, "acc_1").await.unwrap_err();
        assert!(matches!(err, AdapterError::Unauthorized));
    }
}
