use serde::Deserialize;

#[derive(Debug, Deserialize)]
pub struct ProjectsResponse {
    pub projects: Vec<ProjectDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectDto {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub framework: Option<String>,
    #[serde(default)]
    pub latest_deployments: Vec<LatestDeploymentDto>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LatestDeploymentDto {
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub created: Option<i64>,
    #[serde(default)]
    pub ready_state: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub meta: DeploymentMeta,
}

#[derive(Debug, Deserialize)]
pub struct DeploymentsResponse {
    pub deployments: Vec<DeploymentDto>,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentDto {
    pub uid: String,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub inspector_url: Option<String>,
    #[serde(default)]
    pub created_at: Option<i64>,
    #[serde(default)]
    pub ready_at: Option<i64>,
    #[serde(default)]
    pub ready_state: Option<String>,
    #[serde(default)]
    pub state: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub meta: DeploymentMeta,
}

#[derive(Debug, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct DeploymentMeta {
    #[serde(default)]
    pub github_commit_message: Option<String>,
    #[serde(default)]
    pub github_commit_sha: Option<String>,
    #[serde(default)]
    pub github_commit_author_name: Option<String>,
    #[serde(default)]
    pub github_commit_author_login: Option<String>,
    #[serde(default)]
    pub github_commit_ref: Option<String>,
    #[serde(default)]
    pub gitlab_commit_message: Option<String>,
    #[serde(default)]
    pub gitlab_commit_sha: Option<String>,
    #[serde(default)]
    pub gitlab_commit_author_name: Option<String>,
    #[serde(default)]
    pub gitlab_commit_ref: Option<String>,
    #[serde(default)]
    pub bitbucket_commit_message: Option<String>,
    #[serde(default)]
    pub bitbucket_commit_sha: Option<String>,
    #[serde(default)]
    pub bitbucket_commit_author_name: Option<String>,
    #[serde(default)]
    pub bitbucket_commit_ref: Option<String>,
    #[serde(default)]
    pub branch_alias: Option<String>,
}

impl DeploymentMeta {
    pub fn commit_message(&self) -> Option<String> {
        self.github_commit_message
            .clone()
            .or_else(|| self.gitlab_commit_message.clone())
            .or_else(|| self.bitbucket_commit_message.clone())
    }
    pub fn commit_sha(&self) -> Option<String> {
        self.github_commit_sha
            .clone()
            .or_else(|| self.gitlab_commit_sha.clone())
            .or_else(|| self.bitbucket_commit_sha.clone())
    }
    pub fn commit_author(&self) -> Option<String> {
        self.github_commit_author_name
            .clone()
            .or_else(|| self.github_commit_author_login.clone())
            .or_else(|| self.gitlab_commit_author_name.clone())
            .or_else(|| self.bitbucket_commit_author_name.clone())
    }
    pub fn commit_branch(&self) -> Option<String> {
        self.github_commit_ref
            .clone()
            .or_else(|| self.gitlab_commit_ref.clone())
            .or_else(|| self.bitbucket_commit_ref.clone())
            .or_else(|| self.branch_alias.clone())
    }
}
