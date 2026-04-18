use serde::{Deserialize, Serialize};

pub mod r#trait;
pub mod vercel;
pub mod railway;
pub mod registry;

pub use r#trait::{AdapterError, AdapterHandle, DeploymentMonitor};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "lowercase")]
pub enum Platform {
    Vercel,
    Railway,
}

impl Platform {
    pub fn key(&self) -> &'static str {
        match self {
            Platform::Vercel => "vercel",
            Platform::Railway => "railway",
        }
    }

    pub fn from_key(s: &str) -> Option<Self> {
        match s {
            "vercel" => Some(Platform::Vercel),
            "railway" => Some(Platform::Railway),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeploymentState {
    Queued,
    Building,
    Ready,
    Error,
    Canceled,
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountProfile {
    pub id: String,
    pub platform: Platform,
    pub display_name: String,
    pub email: Option<String>,
    pub avatar_url: Option<String>,
    pub scope_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Project {
    pub id: String,
    pub account_id: String,
    pub platform: Platform,
    pub name: String,
    pub url: Option<String>,
    pub framework: Option<String>,
    pub latest_deployment: Option<Deployment>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Deployment {
    pub id: String,
    pub project_id: String,
    pub state: DeploymentState,
    pub environment: String,
    pub url: Option<String>,
    pub inspector_url: Option<String>,
    pub branch: Option<String>,
    pub commit_sha: Option<String>,
    pub commit_message: Option<String>,
    pub author_name: Option<String>,
    pub author_avatar: Option<String>,
    pub created_at: i64,
    pub finished_at: Option<i64>,
    pub duration_ms: Option<u64>,
    pub progress: Option<u8>,
}
