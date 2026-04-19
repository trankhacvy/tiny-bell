# Plan — Railway OAuth Login

Implement "Connect with Railway" OAuth alongside the existing PAT flow, matching the UX of the Vercel OAuth path. This plan is written against the actual code in `src-tauri/` and `src/` — file/line references are concrete.

---

## 1. Protocol summary (confirmed against Railway docs)

- **Flow**: OAuth 2.0 Authorization Code + PKCE (S256) + OIDC. Register a **Native app** — no client secret required/allowed, PKCE mandatory. This is the right fit for a desktop app (no secret to ship in the binary).
- **Endpoints** (all on `backboard.railway.com`):
  - Authorize: `https://backboard.railway.com/oauth/auth`
  - Token:     `https://backboard.railway.com/oauth/token`
  - Userinfo:  `https://backboard.railway.com/oauth/me`
- **Scopes we need**: `openid email profile offline_access workspace:viewer project:viewer`
  - `offline_access` + `prompt=consent` is required to receive a refresh token.
- **Access token TTL**: 1 hour. Refresh tokens rotate — always store the most recent one.
- **API auth**: the OAuth access token is a Bearer token against the same GraphQL endpoint (`backboard.railway.com/graphql/v2`) we already use for PATs. The existing `RailwayAdapter` works as-is once we feed it a fresh access token.
- **Redirect URI**: loopback is supported; must match exactly. We'll reuse the existing `127.0.0.1:53123/callback` pattern from Vercel.

---

## 2. Current state of the codebase (what we're working with)

| Concern | File | Current behavior |
|---|---|---|
| OAuth helpers (PKCE, state, loopback server) | `src-tauri/src/auth/oauth.rs` | Generic — already reusable. `LOOPBACK_PORTS = [53123]` only. |
| Vercel OAuth entry | `src-tauri/src/auth/vercel.rs:146` `start_vercel_oauth` | Uses Vercel's integration-URL + `client_secret` exchange. Not quite a standard OAuth + PKCE flow; the Railway one will be closer to textbook. |
| PAT / profile fetch | `src-tauri/src/auth/pat.rs` | `fetch_railway_profile` queries `me { id email name avatar }`. Works with both PAT and OAuth tokens. |
| `start_oauth` command | `src-tauri/src/commands/accounts.rs:51-64` | Hard-rejects anything that isn't `"vercel"`. |
| Adapter registry | `src-tauri/src/adapters/registry.rs:32-44` | Calls `keychain::get_token` and passes a raw `String` into `RailwayAdapter::new`. No refresh hook. |
| Railway adapter | `src-tauri/src/adapters/railway/mod.rs` | Holds `token: String` — never refreshed. |
| Keychain vault | `src-tauri/src/keychain.rs` | `HashMap<account_id, String>` serialized into a single keychain entry. Values today are raw PATs. |
| Build env injection | `src-tauri/build.rs` | Injects `VERCEL_CLIENT_ID/SECRET/INTEGRATION_SLUG` via `cargo:rustc-env`. No Railway vars yet. |
| Add-account UI | `src/components/account/add-account-form.tsx:55-71` | Mode is hard-wired: `vercel ? "oauth" : "pat"`. "OAuth / Paste token" pill only shown for Vercel. |
| Friendly error | `src/lib/accounts.ts:63-98` | Rail-specific hint assumes PAT ("create a new token… pick 'No workspace'"). |
| Storage model | `src-tauri/src/store.rs` `StoredAccount` | `scope_id: Option<String>` exists but isn't used meaningfully by Railway today (it flattens all workspaces). |
| CSP | `src-tauri/tauri.conf.json:48` | `backboard.railway.com` already allowed in `connect-src`. ✅ |
| Log redaction | `src-tauri/src/redact.rs` | Redacts bearer headers + JSON token fields. Needs verification that `refresh_token` is covered. |

Key implication: **the biggest design choice is how we handle the 1-hour access-token expiry**, because the poller today just reads a string from the keychain and hands it to the adapter.

---

## 3. Design decisions

### 3.1 Native app (no secret)
Register a **Native** OAuth app in Railway with redirect URI `http://127.0.0.1:53123/callback`. Only a `client_id` is required. We ship it at compile time via `build.rs` (same pattern as Vercel). Native apps can't use (and don't need) a client secret.

### 3.2 Token refresh strategy
Access tokens expire in 1h; the poller ticks every 15s. We **must** refresh transparently. Two options considered:

- **A. Centralize in the keychain/vault layer** — introduce a `TokenBundle { access_token, refresh_token, expires_at }`, and a `get_fresh_token(account_id)` helper that refreshes lazily if `expires_at < now + 60s`. Adapters still receive a plain `String` each tick.
- **B. Retry on 401 in the adapter** — adapter holds a refresher closure, catches `Unauthorized`, refreshes, retries.

**Chosen: A, with one tweak.** The `RailwayAdapter` is rebuilt on every `registry.hydrate()` call (the poller calls it every tick — see `poller.rs:141-143`). So instead of giving the adapter a live token-refreshing closure, we:
1. Refresh (if needed) **inside `registry.hydrate()`** when pulling the token out of the keychain.
2. Fall back to a 401-retry path inside the adapter for the rare case where a token expires mid-poll.

This keeps the adapter almost unchanged and puts refresh logic in one place.

### 3.3 Vault format — backward compatible
Current vault value per account: a plain token string (the PAT).

New format: **the value may be either a raw string (legacy PAT) or a JSON blob**:

```json
{ "access_token": "...", "refresh_token": "...", "expires_at_ms": 1_712_345_000_000, "token_type": "oauth" }
```

Detection: on read, attempt `serde_json::from_str::<StoredSecret>`. If it parses and has `"token_type": "oauth"`, treat as OAuth; otherwise treat the raw value as a PAT. Writing an OAuth account always uses JSON.

This avoids any schema migration and keeps existing Vercel/Railway PAT users working without changes.

### 3.4 Scope handling
Railway lets users pick workspaces/projects at consent. We do not need a scope picker in our UI for v1 — accept whatever Railway returns. `scope_id` stays `None` for OAuth accounts; the adapter continues to flatten everything the token can see (same as today for PATs).

### 3.5 Profile fetch
Reuse the existing GraphQL `me { id email name avatar }` query via `fetch_railway_profile` (`auth/pat.rs:40`). It works identically with an OAuth access token, and avoids maintaining a second code path for `/oauth/me`.

### 3.6 UI
Extend the existing mode pill to Railway. Default mode:
- If `RAILWAY_CLIENT_ID` was baked in at build time → default to `"oauth"`.
- Otherwise → default to `"pat"` (same graceful degradation pattern as Vercel).

---

## 4. Concrete changes

### 4.1 Rust — new module: `src-tauri/src/auth/railway.rs`

Mirrors `auth/vercel.rs` in shape, adapted for native + PKCE.

```rust
pub const AUTHORIZE_URL: &str = "https://backboard.railway.com/oauth/auth";
pub const TOKEN_URL:     &str = "https://backboard.railway.com/oauth/token";
pub const SCOPES: &str = "openid email profile offline_access workspace:viewer project:viewer";

const CLIENT_ID: &str = env!("RAILWAY_CLIENT_ID");

pub async fn start_railway_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if CLIENT_ID.is_empty() { return Err(AuthError::Config("Railway OAuth not configured".into())); }

    let pkce = generate_pkce();
    let state = generate_state();
    let binding = oauth::spawn_loopback_server(state.clone())?;
    let redirect = redirect_uri_for(binding.port);

    let url = format!(
        "{AUTHORIZE_URL}?response_type=code&client_id={cid}&redirect_uri={ruri}\
         &scope={scope}&state={state}&code_challenge={cc}&code_challenge_method=S256\
         &prompt=consent",
        cid = urlencoding::encode(CLIENT_ID),
        ruri = urlencoding::encode(&redirect),
        scope = urlencoding::encode(SCOPES),
        state = urlencoding::encode(&state),
        cc = urlencoding::encode(&pkce.challenge),
    );

    open_browser(&url)?;
    let code = /* same await/select pattern as Vercel */;
    let bundle = exchange_code(&code, &redirect, &pkce.verifier).await?;

    // Use existing PAT profile fetcher — same GraphQL endpoint works with OAuth.
    let profile = crate::auth::pat::fetch_railway_profile(&bundle.access_token).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_secret(&account_id, &StoredSecret::oauth(bundle))?;
    store::save_account(&app, /* StoredAccount { platform: Railway, ... } */)?;
    app.emit("oauth:complete", &emitted).ok();
    Ok(emitted)
}

async fn exchange_code(code: &str, redirect: &str, verifier: &str) -> Result<TokenBundle, AuthError> {
    // POST TOKEN_URL form: grant_type=authorization_code, code, redirect_uri,
    //                     client_id=CLIENT_ID, code_verifier=verifier
    //                     (no client_secret — native app)
}

pub async fn refresh(bundle: &TokenBundle) -> Result<TokenBundle, AuthError> {
    // POST TOKEN_URL form: grant_type=refresh_token, refresh_token, client_id
    // If response omits refresh_token, keep the old one.
}
```

Unit tests (wiremock) cover:
- token exchange happy path
- token exchange failure (maps to `AuthError::Provider`)
- refresh with rotated refresh_token
- refresh where response omits refresh_token (keep old)
- refresh 400/invalid_grant → `AuthError::Provider` so `validate_token` marks `NeedsReauth`

### 4.2 Rust — token storage: extend `src-tauri/src/keychain.rs`

Add a typed value layer on top of the current `HashMap<String, String>` vault:

```rust
#[derive(Serialize, Deserialize, Clone)]
#[serde(tag = "token_type", rename_all = "snake_case")]
pub enum StoredSecret {
    Pat { value: String },
    Oauth { access_token: String, refresh_token: String, expires_at_ms: i64 },
}

pub fn store_secret(account_id: &str, secret: &StoredSecret) -> Result<(), AuthError>;
pub fn get_secret(account_id: &str) -> Result<StoredSecret, AuthError>;
```

Implementation detail: existing `store_token` / `get_token` keep working by writing/reading `StoredSecret::Pat` for back-compat. New callers prefer `store_secret` / `get_secret`.

Read path must handle legacy raw-string values in the vault: if `serde_json::from_str::<StoredSecret>` fails, wrap the raw string as `StoredSecret::Pat { value }`.

### 4.3 Rust — refresh-on-read helper: `src-tauri/src/auth/token_provider.rs`

Small, focused module used by `AdapterRegistry::hydrate`:

```rust
/// Returns a valid access token for this account, refreshing if within 60s of expiry.
/// Updates the keychain in place when a refresh occurs.
pub async fn get_fresh_access_token(account_id: &str, platform: Platform) -> Result<String, AuthError> {
    let secret = crate::keychain::get_secret(account_id)?;
    match secret {
        StoredSecret::Pat { value } => Ok(value),
        StoredSecret::Oauth { access_token, refresh_token, expires_at_ms } => {
            let skew = 60_000;
            if chrono::Utc::now().timestamp_millis() + skew < expires_at_ms {
                return Ok(access_token);
            }
            let refreshed = match platform {
                Platform::Railway => crate::auth::railway::refresh(&TokenBundle{...}).await?,
                Platform::Vercel  => /* Vercel tokens don't expire today — noop */,
            };
            crate::keychain::store_secret(account_id, &StoredSecret::Oauth { ... })?;
            Ok(refreshed.access_token)
        }
    }
}
```

### 4.4 Rust — wire it into the registry: `src-tauri/src/adapters/registry.rs`

Currently `hydrate()` is synchronous (`keychain::get_token` is sync). Two options:
- Make `hydrate()` async and `.await` it in `poller::poll_once` (already async). **Preferred**, minimal disruption.
- Spawn a blocking task.

Change lines ~22-45:

```rust
pub async fn hydrate(&self, accounts: &[StoredAccount]) {
    let mut map = HashMap::new();
    for account in accounts.iter().filter(|a| a.enabled) {
        let token = match crate::auth::token_provider::get_fresh_access_token(
            &account.id, account.platform,
        ).await {
            Ok(t) => t,
            Err(e) => { log::warn!("skipping {}: {e}", account.id); continue; }
        };
        /* build VercelAdapter or RailwayAdapter as today */
    }
    *self.inner.write()... = map;
}
```

Call sites to update:
- `src-tauri/src/poller.rs:143` — `self.registry.hydrate(&accounts)` → `.await`.
- `src-tauri/src/commands/accounts.rs:38-49` `rehydrate_after_change` — make async, `.await` the call. All callers are already `async`.

### 4.5 Rust — mid-poll 401 safety net (optional but recommended)

In `src-tauri/src/adapters/railway/client.rs::graphql`, when we hit `AdapterError::Unauthorized`, bubble up as today. The poller (`poller.rs:209-219`, `253-263`) already sets `AccountHealth::NeedsReauth` on unauthorized responses, which triggers a user-visible reconnect prompt. Because refresh already happens at hydrate time (every tick), the window for an in-flight expiry is tiny. We don't need retry-with-refresh inside the adapter for v1.

### 4.6 Rust — plug into the RPC surface: `src-tauri/src/commands/accounts.rs:51-64`

```rust
let profile = match platform.as_str() {
    "vercel"  => start_vercel_oauth(app.clone()).await.map_err(|e| e.to_string())?,
    "railway" => start_railway_oauth(app.clone()).await.map_err(|e| e.to_string())?,
    other     => return Err(format!("OAuth not supported for '{other}'")),
};
```

And register the new module in `src-tauri/src/auth/mod.rs` (`pub mod railway;`).

### 4.7 Rust — build-time env: `src-tauri/build.rs`

Add alongside the Vercel vars:

```rust
let railway_client_id = std::env::var("RAILWAY_CLIENT_ID").unwrap_or_default();
if profile == "release" && railway_client_id.is_empty() {
    println!("cargo:warning=RAILWAY_CLIENT_ID not set — Railway OAuth will be disabled in this build.");
}
println!("cargo:rustc-env=RAILWAY_CLIENT_ID={}", railway_client_id);
println!("cargo:rerun-if-env-changed=RAILWAY_CLIENT_ID");
```

No secret, no integration slug — native app only needs client id.

### 4.8 Rust — redaction check: `src-tauri/src/redact.rs`

Confirm the `refresh_token` JSON key pattern is redacted by the existing rules. Current redactor patterns are (per summary in `research.md`): bearer headers, JSON token fields, query params, `key=value`. Add a test:

```rust
#[test]
fn redacts_refresh_token_in_json() {
    let raw = r#"{"access_token":"AT","refresh_token":"RT-secret","expires_in":3600}"#;
    assert!(!redact(raw).contains("RT-secret"));
}
```

If missing, extend the regex list to include `refresh_token`.

### 4.9 Rust — loopback port resilience

`auth/oauth.rs:12` currently has `LOOPBACK_PORTS = [53123]` — a single port. Vercel and Railway both need to be registered against the same redirect URI, **and** a second OAuth-in-flight would fail. That's actually fine because `abort_current()` (`auth/oauth.rs:168`) cancels any in-flight flow before starting a new one. But if the user has some other process holding 53123, the flow breaks.

Recommendation: expand to `[53123, 53124, 53125]` and register all three as redirect URIs on the Railway app (and add 53124/53125 to Vercel too, for consistency). Cheap win, no structural change.

### 4.10 Frontend — `src/components/account/add-account-form.tsx`

- Remove hard-coded mode branch on lines 55-56 and 66-71; default based on per-platform availability.
- Show the mode pill (lines 148-160) for both platforms.
- Keep `handleOAuth`/`handlePat` handlers as-is — they already route through `accountsApi.startOAuth(platform)`, which now supports `railway`.
- `TOKEN_LINKS.railway.hint` (line 40) — reword so it doesn't imply PAT is the only option.

No changes to `src/lib/accounts.ts`: `accountsApi.startOAuth("railway")` already works against the updated backend command.

### 4.11 Frontend — error copy in `src/lib/accounts.ts:82-93`

Current Railway branch assumes the user pasted a token. After OAuth is available, distinguish:
- `"Railway rejected this token"` → only for PAT path (hard to know from here; keep generic wording like "Railway rejected this authorization — try again").
- Add handling for `invalid_grant` (refresh failure) → user-facing "Your Railway session expired. Please reconnect."

### 4.12 Frontend — onboarding view (`src/app/desktop/views/onboarding-view.tsx`)

Already routes through `add-account-form.tsx`, so once the form supports Railway OAuth, onboarding picks it up for free. Worth smoke-testing.

### 4.13 Docs — `docs/connecting-accounts.md`

Add a "Connect Railway via OAuth" subsection mirroring the Vercel one, including:
- "Launch at `Settings → Accounts → Add → Railway → Connect with Railway`"
- How consent scoping works (user picks workspaces on Railway's page)
- Note about 1h access tokens + automatic refresh
- Troubleshooting: if refresh fails repeatedly → reconnect

### 4.14 Tauri config / CSP

No change needed. `connect-src` already lists `https://backboard.railway.com` (line 48). Authorize URL opens in the user's browser, not the webview, so it's not subject to CSP.

---

## 5. Data-flow walkthrough (the happy path, post-change)

1. User clicks **Add Account → Railway → Connect with Railway** in the desktop window.
2. Frontend calls `accountsApi.startOAuth("railway")` → Tauri invoke `start_oauth`.
3. `commands::accounts::start_oauth` dispatches to `auth::railway::start_railway_oauth`.
4. PKCE pair + state generated. Loopback server bound on `127.0.0.1:53123`.
5. `open_browser()` opens `https://backboard.railway.com/oauth/auth?…&code_challenge=…&prompt=consent`.
6. User authorizes; Railway redirects to `http://127.0.0.1:53123/callback?code=…&state=…`.
7. Loopback server verifies state, hands back the code, serves `SUCCESS_HTML`, shuts down.
8. `exchange_code` POSTs to `/oauth/token` with `code_verifier`. Response includes `access_token`, `refresh_token`, `expires_in`.
9. `fetch_railway_profile(access_token)` populates `AccountProfile`.
10. Keychain vault gets a `StoredSecret::Oauth { .. }` entry keyed by the new `account_id`.
11. `StoredAccount` persisted via `store::save_account`.
12. `rehydrate_after_change(&app).await` → `registry.hydrate().await` → poller wakes up.
13. On every poll tick (every 15s), `get_fresh_access_token` checks `expires_at_ms`; if within 60s of expiry, refreshes via `/oauth/token` and writes back to the vault.
14. Adapter queries `backboard.railway.com/graphql/v2` with the current access token — same path as PAT-based accounts.

---

## 6. Testing

- **Unit (Rust)** — `auth/railway.rs`:
  - authorize-URL construction (params, encoding, PKCE challenge)
  - token exchange: success, non-2xx, malformed body
  - refresh: success with rotation, success without rotation, `invalid_grant`
- **Unit (Rust)** — `keychain.rs`:
  - round-trip `StoredSecret::Oauth`
  - legacy raw-string value deserializes as `StoredSecret::Pat`
- **Unit (Rust)** — `redact.rs`:
  - redacts `refresh_token` in JSON
- **Integration (manual)**:
  - register a Railway Native OAuth app against `http://127.0.0.1:53123/callback`
  - end-to-end connect, wait >1h, confirm refresh happens silently
  - revoke the app in Railway dashboard → next poll surfaces `NeedsReauth`
  - quit/relaunch the app → existing account polls without re-auth
- **Regression**:
  - existing Vercel OAuth still works
  - existing Railway PAT still works (legacy vault value path)

---

## 7. Rollout / configuration

- Register **Dev Radio (Desktop)** as a Railway **Native** OAuth app.
  - Redirect URIs: `http://127.0.0.1:53123/callback` (+ `53124`, `53125` if we expand ports).
  - Scopes requested: `openid email profile offline_access workspace:viewer project:viewer`.
- Add `RAILWAY_CLIENT_ID=xxxxx` to `.env.local` for dev builds and CI release secrets.
- Release builds without the client id gracefully fall back to PAT-only (same pattern as Vercel today — see `build.rs:27-31`).

---

## 8. Out of scope (future phases)

- Workspace/project scope picker inside Dev Radio (Railway handles it at consent time).
- Using `externalWorkspaces` queries for project-only grants — current adapter assumes workspace-level access.
- Migrating existing Railway PAT accounts to OAuth (users simply add a new account and delete the old one).
- Vercel token refresh (Vercel access tokens are long-lived today; leaving that path alone).

---

## 9. Risk summary

| Risk | Mitigation |
|---|---|
| Refresh token rotated, old one saved → next refresh fails | Always overwrite stored refresh_token with the latest response value; on rotation, flush vault immediately. |
| Concurrent refresh from multiple poll ticks | Guard `get_fresh_access_token` with a per-account `tokio::Mutex` in `token_provider` module. |
| Clock skew causes premature "expired" → extra refresh calls | 60s skew + cap refresh rate to once per 30s per account. |
| Loopback port already bound | Expand `LOOPBACK_PORTS` to 3 ports; clear error UX if all fail (already implemented in `bind_first_available`). |
| User denies consent or closes the browser | `CallbackResult::ProviderError` path + 5-minute timeout already handle this. |
| Leaked refresh token in logs | Confirm `redact.rs` covers `refresh_token`; add regression test. |

---

## 10. Summary of file touches

**New:**
- `src-tauri/src/auth/railway.rs`
- `src-tauri/src/auth/token_provider.rs`

**Modified:**
- `src-tauri/src/auth/mod.rs` — `pub mod railway; pub mod token_provider;`
- `src-tauri/src/auth/oauth.rs` — expand `LOOPBACK_PORTS`
- `src-tauri/src/keychain.rs` — add `StoredSecret` + `store_secret` / `get_secret`
- `src-tauri/src/adapters/registry.rs` — `hydrate` becomes async, uses `get_fresh_access_token`
- `src-tauri/src/poller.rs` — `.await` on registry.hydrate (and `commands/accounts.rs` callers)
- `src-tauri/src/commands/accounts.rs` — wire `"railway"` into `start_oauth`
- `src-tauri/build.rs` — emit `RAILWAY_CLIENT_ID`
- `src-tauri/src/redact.rs` — verify/extend `refresh_token` redaction
- `src/components/account/add-account-form.tsx` — enable OAuth mode for Railway
- `src/lib/accounts.ts` — refine `friendlyAuthError` copy
- `docs/connecting-accounts.md` — Railway OAuth section

Total: 2 new files, ~10 focused edits. No schema migration, no breaking change for existing accounts.
