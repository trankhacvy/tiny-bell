use std::collections::HashMap;
use std::sync::{Arc, Mutex, RwLock};

use crate::adapters::github::{GitHubAdapter, GitHubEtagCache};
use crate::adapters::railway::RailwayAdapter;
use crate::adapters::r#trait::AdapterHandle;
use crate::adapters::vercel::VercelAdapter;
use crate::adapters::Platform;
use crate::store::StoredAccount;

#[derive(Default, Debug)]
pub struct AdapterRegistry {
    inner: RwLock<HashMap<String, AdapterHandle>>,
    /// Per-account GitHub ETag caches. These outlive individual `AdapterHandle`s
    /// so the conditional-request optimization survives the registry rebuilding
    /// adapters on every poll cycle.
    github_caches: Mutex<HashMap<String, Arc<GitHubEtagCache>>>,
}

impl AdapterRegistry {
    pub fn new() -> Self {
        Self {
            inner: RwLock::new(HashMap::new()),
            github_caches: Mutex::new(HashMap::new()),
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
                Platform::GitHub => {
                    let cache = self.github_cache_for(&account.id);
                    Arc::new(GitHubAdapter::new(
                        account.id.clone(),
                        token,
                        account.monitored_repos.clone(),
                        cache,
                    ))
                }
            };
            map.insert(account.id.clone(), handle);
        }

        // Keep the active set of GitHub ETag caches aligned with the set of
        // enabled GitHub accounts. Disabled or removed accounts have their
        // cache dropped so we don't leak memory across long sessions.
        let active_github_ids: std::collections::HashSet<String> = accounts
            .iter()
            .filter(|a| a.enabled && a.platform == Platform::GitHub)
            .map(|a| a.id.clone())
            .collect();
        {
            let mut caches = self
                .github_caches
                .lock()
                .unwrap_or_else(|p| p.into_inner());
            caches.retain(|id, _| active_github_ids.contains(id));
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
        self.github_caches
            .lock()
            .unwrap_or_else(|p| p.into_inner())
            .remove(account_id);
    }

    pub fn len(&self) -> usize {
        self.inner
            .read()
            .unwrap_or_else(|p| p.into_inner())
            .len()
    }

    fn github_cache_for(&self, account_id: &str) -> Arc<GitHubEtagCache> {
        let mut guard = self
            .github_caches
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        guard
            .entry(account_id.to_string())
            .or_insert_with(|| Arc::new(GitHubEtagCache::new()))
            .clone()
    }
}
