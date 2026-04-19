use std::collections::HashMap;
use std::sync::{Arc, RwLock};

use crate::adapters::railway::RailwayAdapter;
use crate::adapters::r#trait::AdapterHandle;
use crate::adapters::vercel::VercelAdapter;
use crate::adapters::Platform;
use crate::store::StoredAccount;

#[derive(Default, Debug)]
pub struct AdapterRegistry {
    inner: RwLock<HashMap<String, AdapterHandle>>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
        }
    }

    pub async fn hydrate(&self, accounts: &[StoredAccount]) {
        let mut map: HashMap<String, AdapterHandle> = HashMap::new();
        for account in accounts.iter().filter(|a| a.enabled) {
            let token = match crate::auth::token_provider::get_fresh_access_token(
                &account.id,
                account.platform,
            )
            .await
            {
                Ok(t) => t,
                Err(e) => {
                    log::warn!("skipping {}: no token ({e})", account.id);
                    continue;
                }
            };
            let handle: AdapterHandle = match account.platform {
                Platform::Vercel => Arc::new(VercelAdapter::new(
                    account.id.clone(),
                    token,
                    account.scope_id.clone(),
                )),
                Platform::Railway => Arc::new(RailwayAdapter::new(
                    account.id.clone(),
                    token,
                    account.scope_id.clone(),
                )),
            };
            map.insert(account.id.clone(), handle);
        }
        let mut guard = self.inner.write().unwrap_or_else(|p| p.into_inner());
        *guard = map;
    }

    pub fn all(&self) -> Vec<AdapterHandle> {
        self.inner
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .values()
            .cloned()
            .collect()
    }

    pub fn get(&self, account_id: &str) -> Option<AdapterHandle> {
        self.inner
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .get(account_id)
            .cloned()
    }

    pub fn remove(&self, account_id: &str) {
        self.inner
            .write()
            .unwrap_or_else(|p| p.into_inner())
            .remove(account_id);
    }

    pub fn len(&self) -> usize {
        self.inner
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .len()
    }
}
