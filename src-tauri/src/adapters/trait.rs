use std::sync::Arc;

use async_trait::async_trait;

use crate::adapters::{Deployment, Platform, Project};

#[derive(Debug, thiserror::Error)]
pub enum AdapterError {
    #[error("unauthorized")]
    Unauthorized,
    #[error("rate limited, retry after {0}s")]
    RateLimited(u64),
    #[error("network: {0}")]
    Network(String),
    #[error("platform error: {0}")]
    Platform(String),
    #[error("unsupported operation: {0}")]
    Unsupported(&'static str),
}

impl From<reqwest::Error> for AdapterError {
    fn from(e: reqwest::Error) -> Self {
        AdapterError::Network(e.to_string())
    }
}

pub type AdapterHandle = Arc<dyn DeploymentMonitor>;

#[async_trait]
pub trait DeploymentMonitor: Send + Sync + std::fmt::Debug {
    fn platform(&self) -> Platform;
    fn account_id(&self) -> &str;
    async fn list_projects(&self) -> Result<Vec<Project>, AdapterError>;
    async fn list_deployments(
        &self,
        project_id: &str,
        limit: usize,
    ) -> Result<Vec<Deployment>, AdapterError>;
}
