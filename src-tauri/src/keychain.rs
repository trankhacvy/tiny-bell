use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use keyring::Entry;
use once_cell::sync::OnceCell;

use crate::auth::AuthError;

const SERVICE: &str = "dev-radio";
const VAULT_ACCOUNT: &str = "vault";

type Vault = Arc<RwLock<HashMap<String, String>>>;

static VAULT: OnceCell<Vault> = OnceCell::new();
static LOADED: OnceCell<()> = OnceCell::new();

fn vault() -> &'static Vault {
    VAULT.get_or_init(|| Arc::new(RwLock::new(HashMap::new())))
}

pub fn ensure_loaded() -> Result<(), AuthError> {
    if LOADED.get().is_some() {
        return Ok(());
    }
    let entry = Entry::new(SERVICE, VAULT_ACCOUNT)?;
    let raw = match entry.get_password() {
        Ok(s) => s,
        Err(keyring::Error::NoEntry) => String::from("{}"),
        Err(e) => return Err(AuthError::from(e)),
    };
    let parsed: HashMap<String, String> = serde_json::from_str(&raw).unwrap_or_default();
    {
        let mut guard = vault().write().unwrap_or_else(|p| p.into_inner());
        *guard = parsed;
    }
    migrate_legacy_entries()?;
    let _ = LOADED.set(());
    Ok(())
}

fn flush() -> Result<(), AuthError> {
    let serialized = {
        let guard = vault().read().unwrap_or_else(|p| p.into_inner());
        serde_json::to_string(&*guard)
            .map_err(|e| AuthError::Keychain(format!("serialize vault: {e}")))?
    };
    let entry = Entry::new(SERVICE, VAULT_ACCOUNT)?;
    entry.set_password(&serialized)?;
    tracing::info!(target: "dev_radio::keychain", "vault flushed");
    Ok(())
}

fn migrate_legacy_entries() -> Result<(), AuthError> {
    let has_anything = {
        let guard = vault().read().unwrap_or_else(|p| p.into_inner());
        !guard.is_empty()
    };
    if has_anything {
        return Ok(());
    }
    Ok(())
}

fn legacy_key(platform: &str, account_id: &str) -> String {
    format!("{platform}:{account_id}")
}

pub fn migrate_legacy_for(platform: &str, account_id: &str) -> Result<bool, AuthError> {
    ensure_loaded()?;
    let already = vault()
        .read()
        .unwrap_or_else(|p| p.into_inner())
        .contains_key(account_id);
    if already {
        return Ok(false);
    }
    let key = legacy_key(platform, account_id);
    let entry = Entry::new(SERVICE, &key)?;
    let token = match entry.get_password() {
        Ok(t) => t,
        Err(keyring::Error::NoEntry) => return Ok(false),
        Err(e) => return Err(AuthError::from(e)),
    };
    {
        let mut guard = vault().write().unwrap_or_else(|p| p.into_inner());
        guard.insert(account_id.into(), token);
    }
    flush()?;
    let _ = entry.delete_credential();
    Ok(true)
}

pub fn store_token(_platform: &str, account_id: &str, token: &str) -> Result<(), AuthError> {
    ensure_loaded()?;
    {
        let mut guard = vault().write().unwrap_or_else(|p| p.into_inner());
        guard.insert(account_id.into(), token.into());
    }
    flush()?;
    tracing::info!(
        target: "dev_radio::keychain",
        account_id = account_id,
        "token stored"
    );
    Ok(())
}

pub fn get_token(platform: &str, account_id: &str) -> Result<String, AuthError> {
    ensure_loaded()?;
    if let Some(token) = vault()
        .read()
        .unwrap_or_else(|p| p.into_inner())
        .get(account_id)
        .cloned()
    {
        return Ok(token);
    }
    if migrate_legacy_for(platform, account_id)? {
        if let Some(token) = vault()
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .get(account_id)
            .cloned()
        {
            return Ok(token);
        }
    }
    Err(AuthError::Keychain("missing token".into()))
}

pub fn delete_token(_platform: &str, account_id: &str) -> Result<(), AuthError> {
    ensure_loaded()?;
    let removed = {
        let mut guard = vault().write().unwrap_or_else(|p| p.into_inner());
        guard.remove(account_id).is_some()
    };
    if removed {
        flush()?;
    }
    let legacy_entry = Entry::new(SERVICE, &legacy_key(_platform, account_id))?;
    let _ = legacy_entry.delete_credential();
    Ok(())
}

pub fn has_any_token() -> bool {
    if ensure_loaded().is_err() {
        return false;
    }
    !vault()
        .read()
        .unwrap_or_else(|p| p.into_inner())
        .is_empty()
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    #[ignore = "requires OS keychain access; run manually"]
    fn round_trip_store_get_delete() {
        let account_id = format!("test-{}", Uuid::new_v4());
        let token = "test-token-value";

        store_token("vercel", &account_id, token).expect("store");
        let fetched = get_token("vercel", &account_id).expect("get");
        assert_eq!(fetched, token);
        delete_token("vercel", &account_id).expect("delete");
        assert!(get_token("vercel", &account_id).is_err());
    }

    #[test]
    #[ignore = "requires OS keychain access; run manually"]
    fn delete_missing_is_idempotent() {
        let account_id = format!("missing-{}", Uuid::new_v4());
        delete_token("vercel", &account_id).expect("idempotent delete");
    }
}
