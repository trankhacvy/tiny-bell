pub mod client;
pub mod mapper;
pub mod types;

use async_trait::async_trait;

use crate::adapters::r#trait::{AdapterError, DeploymentMonitor};
use crate::adapters::{Deployment, Platform, Project};

pub const DEFAULT_GRAPHQL_URL: &str = "https://backboard.railway.com/graphql/v2";

#[derive(Debug)]
pub struct RailwayAdapter {
    account_id: String,
    token: String,
    scope_id: Option<String>,
    http: reqwest::Client,
    graphql_url: String,
}

impl RailwayAdapter {
    pub fn new(account_id: String, token: String, scope_id: Option<String>) -> Self {
        Self::with_url(account_id, token, scope_id, DEFAULT_GRAPHQL_URL.to_string())
    }

    pub fn with_url(
        account_id: String,
        token: String,
        scope_id: Option<String>,
        graphql_url: String,
    ) -> Self {
        Self {
            account_id,
            token,
            scope_id,
            http: reqwest::Client::new(),
            graphql_url,
        }
    }
}

#[async_trait]
impl DeploymentMonitor for RailwayAdapter {
    fn platform(&self) -> Platform {
        Platform::Railway
    }

    fn account_id(&self) -> &str {
        &self.account_id
    }

    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError> {
        client::fetch_projects(
            &self.http,
            &self.graphql_url,
            &self.token,
            self.scope_id.as_deref(),
            &self.account_id,
        )
        .await
    }

    async fn list_recent_deployments(
        &self,
        project_ids: Option<&[String]>,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        let ids: Vec<String> = match project_ids {
            Some(ids) if !ids.is_empty() => ids.to_vec(),
            _ => self
                .list_projects()
                .await?
                .into_iter()
                .map(|p| p.id)
                .collect(),
        };
        client::fetch_recent_deployments(
            &self.http,
            &self.graphql_url,
            &self.token,
            &ids,
            limit,
        )
        .await
    }
}
