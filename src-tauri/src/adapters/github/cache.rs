//! Per-account cache for GitHub conditional requests.
//!
//! GitHub's REST API supports `If-None-Match` on most endpoints, and 304
//! responses **do not count against the rate limit** — see the "Conditional
//! requests" section of the GitHub REST docs. For the deploy-monitor use case
//! that's a huge win: a project watching 30 repos at 10s interval drops from
//! 10 800 req/hour (over the 5 000/hr PAT limit) to roughly the number of
//! workflow runs that actually changed.
//!
//! This cache stores, per repo:
//!   - the `ETag` returned by the previous 200 OK response
//!   - the mapped `Vec<Deployment>` from that response (so a 304 can answer
//!     with the same data without re-parsing)
//!
//! The cache lives in the `AdapterRegistry` rather than inside the adapter
//! itself, because the registry recreates adapters on every poll cycle when
//! it hydrates from the stored account list. Keeping the cache one level up
//! means it survives those hydrations.

use std::collections::HashMap;
use std::sync::Mutex;

use crate::adapters::Deployment;

#[derive(Debug, Default)]
pub struct GitHubEtagCache {
    inner: Mutex<HashMap<String, CacheEntry>>,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    etag: String,
    deployments: Vec<Deployment>,
}

impl GitHubEtagCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// Latest ETag stored for this repo, if any.
    pub fn etag(&self, repo: &str) -> Option<String> {
        let guard = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        guard.get(repo).map(|e| e.etag.clone())
    }

    /// Deployments associated with the latest stored ETag for this repo.
    pub fn deployments(&self, repo: &str) -> Option<Vec<Deployment>> {
        let guard = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        guard.get(repo).map(|e| e.deployments.clone())
    }

    /// Replace the cached entry for a repo after a 200 OK response.
    pub fn set(&self, repo: &str, etag: String, deployments: Vec<Deployment>) {
        let mut guard = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        guard.insert(repo.to_string(), CacheEntry { etag, deployments });
    }

    /// Forget any cache for repos that the user no longer monitors.
    /// Cheap to call on every cycle.
    pub fn retain(&self, keep: impl Fn(&str) -> bool) {
        let mut guard = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        guard.retain(|repo, _| keep(repo));
    }

    #[cfg(test)]
    pub fn len(&self) -> usize {
        let guard = self.inner.lock().unwrap_or_else(|p| p.into_inner());
        guard.len()
    }
}
