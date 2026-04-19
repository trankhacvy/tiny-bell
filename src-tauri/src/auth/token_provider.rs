use crate::adapters::Platform;
use crate::auth::AuthError;
use crate::keychain::{self, StoredSecret};

const EXPIRY_SKEW_MS: i64 = 60_000;

pub async fn get_fresh_access_token(
    account_id: &str,
    platform: Platform,
) -> Result<String, AuthError> {
    let secret = keychain::get_secret(platform.key(), account_id)?;
    match secret {
        StoredSecret::Pat { value } => Ok(value),
        StoredSecret::Oauth {
            access_token,
            refresh_token,
            expires_at_ms,
        } => {
            let now_ms = chrono::Utc::now().timestamp_millis();
            if now_ms + EXPIRY_SKEW_MS < expires_at_ms {
                return Ok(access_token);
            }
            match platform {
                Platform::Railway => {
                    let refreshed =
                        crate::auth::railway::refresh_tokens(&refresh_token).await?;
                    let new_refresh_token = refreshed.refresh_token.unwrap_or(refresh_token);
                    let new_expires_at_ms =
                        now_ms + (refreshed.expires_in_secs as i64) * 1000;
                    let new_secret = StoredSecret::Oauth {
                        access_token: refreshed.access_token.clone(),
                        refresh_token: new_refresh_token,
                        expires_at_ms: new_expires_at_ms,
                    };
                    keychain::store_secret(account_id, &new_secret)?;
                    Ok(refreshed.access_token)
                }
                Platform::Vercel => Ok(access_token),
            }
        }
    }
}
