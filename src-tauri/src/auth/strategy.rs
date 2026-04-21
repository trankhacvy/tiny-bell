use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::adapters::{AccountProfile, Platform};
use crate::auth::AuthError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethodKind {
    Pat,
    OauthLoopback,
    OauthBroker,
    DeviceCode,
}

pub fn methods_for(platform: Platform) -> Vec<AuthMethodKind> {
    match platform {
        Platform::Vercel => {
            if crate::auth::vercel::is_configured() {
                vec![AuthMethodKind::OauthBroker, AuthMethodKind::Pat]
            } else {
                vec![AuthMethodKind::Pat]
            }
        }
        Platform::Railway => {
            if crate::auth::railway::is_configured() {
                vec![AuthMethodKind::OauthLoopback, AuthMethodKind::Pat]
            } else {
                vec![AuthMethodKind::Pat]
            }
        }
        Platform::GitHub => {
            if crate::auth::github::is_configured() {
                vec![AuthMethodKind::DeviceCode, AuthMethodKind::Pat]
            } else {
                vec![AuthMethodKind::Pat]
            }
        }
    }
}

pub fn default_oauth_method(platform: Platform) -> Option<AuthMethodKind> {
    methods_for(platform)
        .into_iter()
        .find(|m| !matches!(m, AuthMethodKind::Pat))
}

pub async fn start_oauth(
    platform: Platform,
    app: AppHandle,
) -> Result<AccountProfile, AuthError> {
    match platform {
        Platform::Vercel => crate::auth::vercel::start_vercel_oauth(app).await,
        Platform::Railway => crate::auth::railway::start_railway_oauth(app).await,
        Platform::GitHub => crate::auth::github::start_github_oauth(app).await,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn vercel_prefers_broker_when_configured() {
        let methods = methods_for(Platform::Vercel);
        assert!(methods.contains(&AuthMethodKind::Pat));
    }

    #[test]
    fn railway_prefers_loopback_when_configured() {
        let methods = methods_for(Platform::Railway);
        assert!(methods.contains(&AuthMethodKind::Pat));
    }

    #[test]
    fn github_prefers_device_code_when_configured() {
        let methods = methods_for(Platform::GitHub);
        assert!(methods.contains(&AuthMethodKind::Pat));
    }

    #[test]
    fn default_oauth_method_is_never_pat() {
        for platform in [Platform::Vercel, Platform::Railway, Platform::GitHub] {
            if let Some(method) = default_oauth_method(platform) {
                assert_ne!(method, AuthMethodKind::Pat);
            }
        }
    }
}
