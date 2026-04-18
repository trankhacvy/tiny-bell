pub mod client;
pub mod mapper;
pub mod types;

use async_trait::async_trait;

use crate::adapters::r#trait::{AdapterError, DeploymentMonitor};
use crate::adapters::{Deployment, Platform, Project};

pub const DEFAULT_GRAPHQL_URL: &str = "https://backboard.railway.app/graphql/v2";

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

    async fn list_deployments(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError> {
        client::fetch_deployments(
            &self.http,
            &self.graphql_url,
            &self.token,
            project_id,
            limit,
        )
        .await
    }
}
