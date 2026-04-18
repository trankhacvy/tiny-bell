use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct GraphqlResponse<T> {
    pub data: Option<T>,
    #[serde(default)]
    pub errors: Option<Vec<GraphqlError>>,
}

#[derive(Debug, Deserialize)]
pub struct GraphqlError {
    pub message: String,
}

#[derive(Debug, Deserialize)]
pub struct MeProjectsData {
    pub me: MeNode,
}

#[derive(Debug, Deserialize)]
pub struct MeNode {
    #[serde(default)]
    pub workspaces: Vec<WorkspaceNode>,
}

#[derive(Debug, Deserialize)]
pub struct WorkspaceNode {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub projects: ProjectConnection,
}

#[derive(Debug, Deserialize, Default)]
pub struct ProjectConnection {
    #[serde(default)]
    pub edges: Vec<ProjectEdge>,
}

#[derive(Debug, Deserialize)]
pub struct ProjectEdge {
    pub node: ProjectNode,
}

#[derive(Debug, Deserialize)]
pub struct ProjectNode {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub services: ServiceConnection,
}

#[derive(Debug, Deserialize, Default)]
pub struct ServiceConnection {
    #[serde(default)]
    pub edges: Vec<ServiceEdge>,
}

#[derive(Debug, Deserialize)]
pub struct ServiceEdge {
    pub node: ServiceNode,
}

#[derive(Debug, Deserialize)]
pub struct ServiceNode {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Deserialize)]
pub struct DeploymentsData {
    pub deployments: DeploymentConnection,
}

#[derive(Debug, Deserialize)]
pub struct DeploymentConnection {
    #[serde(default)]
    pub edges: Vec<DeploymentEdge>,
}

#[derive(Debug, Deserialize)]
pub struct DeploymentEdge {
    pub node: DeploymentNode,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentNode {
    pub id: String,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub static_url: Option<String>,
    #[serde(default)]
    pub meta: serde_json::Value,
}
