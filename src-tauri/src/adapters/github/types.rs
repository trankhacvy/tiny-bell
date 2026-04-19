use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct WorkflowRunsResponse {
    #[serde(default)]
    pub workflow_runs: Vec<WorkflowRunDto>,
}

#[derive(Debug, Deserialize)]
pub struct WorkflowRunDto {
    pub id: i64,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub conclusion: Option<String>,
    #[serde(default)]
    pub html_url: Option<String>,
    #[serde(default)]
    pub head_branch: Option<String>,
    #[serde(default)]
    pub head_sha: Option<String>,
    #[serde(default)]
    pub head_commit: Option<HeadCommitDto>,
    #[serde(default)]
    pub actor: Option<ActorDto>,
    #[serde(default)]
    pub workflow_id: Option<i64>,
    #[serde(default)]
    pub event: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub run_started_at: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct HeadCommitDto {
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ActorDto {
    #[serde(default)]
    pub login: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RepoDto {
    pub full_name: String,
    pub name: String,
    #[serde(rename = "private")]
    #[serde(default)]
    pub is_private: bool,
    #[serde(default)]
    pub default_branch: Option<String>,
}
