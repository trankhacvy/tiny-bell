use serde::Serialize;

use crate::adapters::r#trait::AdapterError;
use crate::adapters::railway::mapper::{build_project, deployment_from_node};
use crate::adapters::railway::types::{
    DeploymentsData, GraphqlResponse, MeProjectsData,
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
            services {
              edges {
                node { id name }
              }
            }
          }
        }
      }
    }
  }
}"#;

const DEPLOYMENTS_QUERY: &str = r#"query Deployments($serviceId: String!, $first: Int!) {
  deployments(first: $first, input: { serviceId: $serviceId }) {
    edges {
      node {
        id
        status
        createdAt
        updatedAt
        url
        staticUrl
        meta
      }
    }
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
            let project_name = pe.node.name;
            for se in pe.node.services.edges {
                out.push(build_project(
                    &se.node.id,
                    &project_name,
                    &se.node.name,
                    account_id,
                ));
            }
        }
    }
    Ok(out)
}

pub async fn fetch_deployments(
    http: &reqwest::Client,
    url: &str,
    token: &str,
    service_id: &str,
    limit: usize,
) -> Result<Vec<Deployment>, AdapterError> {
    let data: DeploymentsData = graphql(
        http,
        url,
        token,
        DEPLOYMENTS_QUERY,
        serde_json::json!({ "serviceId": service_id, "first": limit }),
    )
    .await?;

    Ok(data
        .deployments
        .edges
        .into_iter()
        .map(|e| deployment_from_node(e.node, service_id))
        .collect())
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
                                        {
                                            "node": {
                                                "id": "prj_1",
                                                "name": "api",
                                                "services": {
                                                    "edges": [
                                                        { "node": { "id": "svc_1", "name": "web" } },
                                                        { "node": { "id": "svc_2", "name": "worker" } }
                                                    ]
                                                }
                                            }
                                        }
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
        assert_eq!(projects[0].name, "api/web");
        assert_eq!(projects[1].name, "api/worker");
    }

    #[tokio::test]
    async fn fetches_deployments() {
        let server = MockServer::start().await;
        Mock::given(method("POST"))
            .and(path("/graphql/v2"))
            .respond_with(ResponseTemplate::new(200).set_body_json(serde_json::json!({
                "data": {
                    "deployments": {
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
                                    }
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
        let deps = fetch_deployments(&http, &url, "tok", "svc_1", 10).await.unwrap();
        assert_eq!(deps.len(), 1);
        assert_eq!(deps[0].id, "dep_1");
        assert_eq!(deps[0].commit_message.as_deref(), Some("Fix build issues"));
        assert_eq!(deps[0].branch.as_deref(), Some("next"));
        assert!(deps[0].duration_ms.is_some());
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
