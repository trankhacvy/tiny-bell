# Plan — Shipping Tiny Bell to end users without leaking OAuth secrets

This plan is grounded in the actual code as of `main` (post `d216d81`). All file paths, line numbers, and snippets refer to the current tree.

---

## 1. The problem, in one paragraph

Tiny Bell is distributed to end users as a signed binary. The binary currently embeds `VERCEL_CLIENT_SECRET`, `GITHUB_CLIENT_SECRET`, `VERCEL_CLIENT_ID`, `RAILWAY_CLIENT_ID`, `GITHUB_CLIENT_ID`, and `VERCEL_INTEGRATION_SLUG` at compile time (`src-tauri/build.rs:22-53`). Any user can extract these with `strings`, a hex editor, or by running mitmproxy against the app. A leaked `client_secret` means anyone can impersonate our OAuth app; if a provider revokes the app, every installed copy stops working until a new binary ships. This is the well-known "public client" problem in OAuth 2.0, and the fix is **not** to hide the secret better — it is to stop shipping one.

---

## 2. Audit of the current state

Read directly from source:

| Provider | File | Secret shipped? | Flow today |
|---|---|---|---|
| **Vercel** | `src-tauri/src/auth/vercel.rs:11-14` | `VERCEL_CLIENT_ID` + `VERCEL_CLIENT_SECRET` + `VERCEL_INTEGRATION_SLUG` | Authorization code (NOT PKCE). Sends `client_secret` to token endpoint (`vercel.rs:215-220`). |
| **Railway** | `src-tauri/src/auth/railway.rs:13` | `RAILWAY_CLIENT_ID` only — **no secret** | PKCE code flow. Token exchange posts `client_id` + `code` + `code_verifier`, no secret (`railway.rs:160-167`). |
| **GitHub** | `src-tauri/src/auth/github.rs:11-12` | `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` | Classic OAuth App. Sends `client_secret` to token endpoint (`github.rs:142-147`). |

So we have **two real problems** (Vercel and GitHub) and **one non-problem** (Railway, which is already a pure public client — `client_id` in a binary is fine, that's a public identifier like a username).

Supporting pieces already in the tree we will build on:

- **Keychain vault** — `src-tauri/src/keychain.rs:13-24` already supports both `StoredSecret::Pat` and `StoredSecret::Oauth { access_token, refresh_token, expires_at_ms }`.
- **Token refresh hook** — `src-tauri/src/auth/token_provider.rs:14-41` already refreshes Railway OAuth tokens via `refresh_tokens()`.
- **Adapter abstraction** — `DeploymentMonitor` trait at `src-tauri/src/adapters/trait.rs` plus `AdapterRegistry::hydrate` at `registry.rs:28-65` pick the right adapter per platform. Provider-agnostic.
- **Dual-mode UI** — `src/components/account/add-account-form.tsx:70,84` toggles between OAuth and PAT. GitHub already defaults to PAT because its consent screen requires the broad `repo` scope.

---

## 3. Target architecture

Three flows, picked per provider by what the provider actually supports, with PAT as a universal fallback:

```
 ┌─────────────────────────────────────────────────────────────────────┐
 │                           Tiny Bell Desktop                           │
 │                                                                       │
 │   ┌───────────────┐  ┌───────────────┐  ┌───────────────┐           │
 │   │  PAT flow     │  │ Public-client │  │  Broker flow  │           │
 │   │  (all)        │  │ PKCE (Railway)│  │  (Vercel)     │           │
 │   └───────┬───────┘  └───────┬───────┘  └───────┬───────┘           │
 │           │                  │                  │                    │
 │           │          ┌───────┴──────────────────┴─────┐              │
 │           │          │ Device Flow (GitHub)           │              │
 │           │          └────────────────────────────────┘              │
 │           └──────────────────┬───────────────────────────┐           │
 │                              │                           │           │
 │                              ▼                           ▼           │
 │                     ┌────────────────┐          ┌──────────────┐    │
 │                     │ OS Keychain     │          │  Broker       │    │
 │                     │ (StoredSecret)  │          │  (CF Workers) │    │
 │                     └────────────────┘          │  stateless    │    │
 │                                                 │  holds only   │    │
 │                                                 │  client_secret│    │
 │                                                 └──────────────┘    │
 └─────────────────────────────────────────────────────────────────────┘
```

Per-provider end state:

| Provider | End-state flow | What's in the binary | Broker needed? |
|---|---|---|---|
| **Vercel** | Broker-mediated authorization code | nothing sensitive (just broker URL) | **Yes** |
| **Railway** | PKCE public client (unchanged) | `RAILWAY_CLIENT_ID` (public) | No |
| **GitHub** | Device Flow | `GITHUB_CLIENT_ID` (public) | No |
| *Any future provider* | Pick one from the menu; PAT always available | Ideally just `client_id` | Only if provider requires `client_secret` AND has no device flow |

A small `AuthStrategy` trait lets us slot a new flow in without touching the command layer.

---

## 4. Phased implementation

Each phase ships independently and delivers user-visible value.

- **Phase 1** — GitHub → Device Flow (biggest win per line of code)
- **Phase 2** — Stand up the OAuth broker (infra only, no user-visible change)
- **Phase 3** — Vercel → broker (removes the second `client_secret`)
- **Phase 4** — `AuthStrategy` trait refactor (internal cleanup)
- **Phase 5** — Documentation + power-user escape hatch + new-provider playbook
- **Phase 6** — Release-engineering tidy-up

---

## Phase 1 — GitHub → Device Flow

### Why this first

- Zero infrastructure. No broker needed.
- Eliminates one of the two `client_secret`s from the binary today.
- GitHub's Device Flow is the flow they *recommend* for native apps (<https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow>).
- Better UX than the current OAuth path, which the team already disabled by default (`add-account-form.tsx:84`) because classic OAuth Apps require the too-broad `repo` scope.

### What device flow looks like

1. App calls `POST https://github.com/login/device/code` with `client_id` + `scope`.
2. GitHub returns `device_code`, `user_code` (e.g. `WDJB-MJHT`), `verification_uri`, `interval`, `expires_in`.
3. App shows the `user_code` and opens the browser at `verification_uri`.
4. App polls `POST https://github.com/login/oauth/access_token` with `grant_type=urn:ietf:params:oauth:grant-type:device_code` + `device_code` + `client_id`.
5. GitHub returns the access token once the user approves. **No `client_secret` at any step.**

### Changes required

#### Rust: replace `start_github_oauth` with device flow

Rewrite `src-tauri/src/auth/github.rs`. Drop `CLIENT_SECRET`, drop `spawn_loopback_server`, add a polling loop and a new `oauth:device_code` event so the UI can display the code.

```rust
// src-tauri/src/auth/github.rs (new structure)
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::adapters::{AccountProfile, Platform};
use crate::auth::AuthError;
use crate::store::{self, AccountHealth, StoredAccount};

const CLIENT_ID: &str = env!("GITHUB_CLIENT_ID");
const DEVICE_CODE_URL: &str = "https://github.com/login/device/code";
const TOKEN_URL: &str = "https://github.com/login/oauth/access_token";
const SCOPES: &str = "repo read:user";
pub const API_BASE: &str = "https://api.github.com";

// Keep fetch_github_profile + fetch_github_profile_with_base as-is.

pub fn is_configured() -> bool {
    !CLIENT_ID.is_empty()
}

#[derive(Debug, Deserialize)]
struct DeviceCodeResponse {
    device_code: String,
    user_code: String,
    verification_uri: String,
    expires_in: u64,
    interval: u64,
}

#[derive(serde::Serialize, Clone)]
pub struct DeviceCodePayload {
    pub user_code: String,
    pub verification_uri: String,
    pub expires_in: u64,
}

pub async fn start_github_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if !is_configured() {
        return Err(AuthError::Config(
            "GitHub OAuth not configured — set GITHUB_CLIENT_ID at build time".into(),
        ));
    }

    let client = reqwest::Client::new();
    let device: DeviceCodeResponse = client
        .post(DEVICE_CODE_URL)
        .header("Accept", "application/json")
        .header("User-Agent", "tiny-bell")
        .form(&[("client_id", CLIENT_ID), ("scope", SCOPES)])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;

    // UI shows the user_code + "Open github.com/login/device" button.
    let _ = app.emit(
        "oauth:device_code",
        DeviceCodePayload {
            user_code: device.user_code.clone(),
            verification_uri: device.verification_uri.clone(),
            expires_in: device.expires_in,
        },
    );
    let _ = tauri_plugin_opener::open_url(&device.verification_uri, None::<&str>);

    let access_token = poll_for_token(&client, &device).await?;
    let profile = fetch_github_profile(&access_token).await?;

    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(Platform::GitHub.key(), &account_id, &access_token)?;
    let stored = StoredAccount {
        id: account_id.clone(),
        platform: Platform::GitHub,
        display_name: profile.display_name.clone(),
        scope_id: None,
        enabled: true,
        created_at: chrono::Utc::now().timestamp_millis(),
        health: AccountHealth::Ok,
        monitored_repos: None,
    };
    store::save_account(&app, &stored).map_err(AuthError::Store)?;

    let emitted = AccountProfile { id: account_id, ..profile };
    let _ = app.emit("oauth:complete", &emitted);
    Ok(emitted)
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum TokenPollResponse {
    Ok { access_token: String },
    Err { error: String, #[serde(default)] error_description: Option<String> },
}

async fn poll_for_token(
    client: &reqwest::Client,
    device: &DeviceCodeResponse,
) -> Result<String, AuthError> {
    let deadline = std::time::Instant::now()
        + std::time::Duration::from_secs(device.expires_in);
    let mut interval = device.interval.max(5);

    while std::time::Instant::now() < deadline {
        tokio::time::sleep(std::time::Duration::from_secs(interval)).await;
        let res = client
            .post(TOKEN_URL)
            .header("Accept", "application/json")
            .header("User-Agent", "tiny-bell")
            .form(&[
                ("client_id", CLIENT_ID),
                ("device_code", device.device_code.as_str()),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await?
            .error_for_status()?
            .json::<TokenPollResponse>()
            .await?;

        match res {
            TokenPollResponse::Ok { access_token } => return Ok(access_token),
            TokenPollResponse::Err { error, error_description } => match error.as_str() {
                "authorization_pending" => continue,
                "slow_down" => { interval += 5; continue; }
                "expired_token" => return Err(AuthError::Timeout),
                "access_denied" => return Err(AuthError::Provider(
                    "User cancelled the authorization".into())),
                other => return Err(AuthError::Provider(
                    error_description.unwrap_or_else(|| other.to_string()))),
            },
        }
    }
    Err(AuthError::Timeout)
}
```

Plus a `cancel_github_oauth` hook if we want the Cancel button in the UI to actually stop the poll loop (use a `tokio::sync::Notify` stored in a `OnceCell`, similar to `oauth.rs:83-87`).

#### Build: drop the GitHub secret

Edit `src-tauri/build.rs` — remove every reference to `GITHUB_CLIENT_SECRET`:

```rust
// src-tauri/build.rs — delete these lines:
//   let github_client_secret = std::env::var("GITHUB_CLIENT_SECRET").unwrap_or_default();
//   println!("cargo:rustc-env=GITHUB_CLIENT_SECRET={}", github_client_secret);
//   println!("cargo:rerun-if-env-changed=GITHUB_CLIENT_SECRET");
// Adjust the warning on line 42-46 to only reference GITHUB_CLIENT_ID.
```

And update `.env.example` to drop the `GITHUB_CLIENT_SECRET=` line.

#### Frontend: show the device code

Add a device-code panel to `src/components/account/add-account-form.tsx`. Listen for `oauth:device_code` (in parallel with `oauth:complete`), and render the big monospace code + "Continue on github.com" link.

```tsx
// src/components/account/add-account-form.tsx — add near the oauth:complete listener
useEffect(() => {
  let unlisten: UnlistenFn | undefined
  listen<{ user_code: string; verification_uri: string; expires_in: number }>(
    "oauth:device_code",
    (event) => setDeviceCode(event.payload),
  ).then((fn) => { unlisten = fn })
  return () => { unlisten?.() }
}, [])

// In the oauth branch, when deviceCode is set, render:
//   <DeviceCodePanel code={deviceCode.user_code} uri={deviceCode.verification_uri} />
// With a "Copy code" button (clipboard API) and "Open github.com/login/device" button.
```

Also: re-enable OAuth as the default for GitHub now that it's good. Remove the `platform === "github" ? "pat"` override at `add-account-form.tsx:84`.

#### GitHub App registration

On github.com/settings/developers, the existing OAuth App needs one change: **Enable Device Flow** checkbox. No new app, no new ID.

#### Tests

Mirror the existing wiremock tests in `github.rs:191-254`:

```rust
#[tokio::test]
async fn device_flow_returns_token_when_approved() {
    // MockServer: POST /login/device/code → 200 { device_code, user_code, ... interval: 0 }
    // MockServer: POST /login/oauth/access_token:
    //   first call → 200 { error: "authorization_pending" }
    //   second call → 200 { access_token: "gho_test" }
    // Assert the returned token matches.
}
#[tokio::test]
async fn device_flow_respects_slow_down() { /* ... */ }
#[tokio::test]
async fn device_flow_surfaces_access_denied() { /* ... */ }
```

### Phase 1 deliverable

A release where GitHub's binary contains no `client_secret` and OAuth is the default again.

---

## Phase 2 — Stand up the OAuth broker

This phase adds infrastructure without changing the desktop app yet. Ship it first, verify it works with a staging Vercel app, then cut over in Phase 3.

### Design constraints

- **Stateless** — no database. Brokers that store tokens are liability magnets.
- **Single-region Cloudflare Workers** (free tier covers our scale). Alternative: Vercel Edge Function.
- **Custom domain**: `auth.tinybell.app` (or wherever; pick one and commit). Desktop binary embeds this URL.
- **No hard-coded user data.** Only thing the worker ever sees in a secret context is the authorization code during the code→token exchange, which is a one-time value.
- **Health check**: `GET /health` returns 200 so the app can detect outages.

### Broker endpoints

Two endpoints per provider:

- `GET /:provider/authorize?redirect=<loopback>&state=<s>&challenge=<c>&challenge_method=S256`
  - Broker generates its own `state` (to bind the subsequent callback to the app session), stores the incoming loopback + PKCE info in a **short-lived signed JWT cookie** (5 min TTL), and redirects the browser to the provider's authorize endpoint with broker's redirect URI.
- `GET /:provider/callback?code=...&state=...`
  - Broker reads the cookie, validates `state`, exchanges the code for a token using its `client_secret`, then redirects to the original loopback with `?token=<access_token>&state=<original-state>`.

The desktop app's existing `spawn_loopback_server` (`oauth.rs:94-151`) works unchanged — it already parses `code` and `state` from the callback URL. We just adjust the parser to also accept `token` / `refresh_token` / `expires_in` when the provider is broker-mediated.

### Minimal broker worker (Cloudflare Workers + Hono)

```ts
// broker/src/index.ts
import { Hono } from "hono"
import { sign, verify } from "hono/jwt"
import { setSignedCookie, getSignedCookie, deleteCookie } from "hono/cookie"

type Env = {
  BROKER_SIGNING_KEY: string
  VERCEL_CLIENT_ID: string
  VERCEL_CLIENT_SECRET: string
  VERCEL_INTEGRATION_SLUG: string
  // add future providers here
}

const app = new Hono<{ Bindings: Env }>()

app.get("/health", (c) => c.json({ ok: true }))

// Vercel ────────────────────────────────────────────────────────────
app.get("/vercel/authorize", async (c) => {
  const url = new URL(c.req.url)
  const loopback = url.searchParams.get("redirect")
  const appState = url.searchParams.get("state")
  if (!loopback?.startsWith("http://127.0.0.1:") || !appState) {
    return c.text("bad request", 400)
  }

  // Sign a short-lived cookie binding this in-flight auth to the loopback.
  const brokerState = crypto.randomUUID()
  const cookieValue = await sign(
    {
      loopback,
      app_state: appState,
      provider: "vercel",
      exp: Math.floor(Date.now() / 1000) + 300,
    },
    c.env.BROKER_SIGNING_KEY,
  )
  await setSignedCookie(
    c, `tb_oauth_${brokerState}`, cookieValue, c.env.BROKER_SIGNING_KEY,
    { path: "/", sameSite: "Lax", secure: true, httpOnly: true, maxAge: 300 },
  )

  const ruri = `${new URL(c.req.url).origin}/vercel/callback`
  const authorize = new URL(
    `https://vercel.com/integrations/${c.env.VERCEL_INTEGRATION_SLUG}/new`,
  )
  authorize.searchParams.set("redirect_uri", ruri)
  authorize.searchParams.set("state", brokerState)
  return c.redirect(authorize.toString())
})

app.get("/vercel/callback", async (c) => {
  const code = c.req.query("code")
  const brokerState = c.req.query("state")
  if (!code || !brokerState) return c.text("bad request", 400)

  const raw = await getSignedCookie(
    c, c.env.BROKER_SIGNING_KEY, `tb_oauth_${brokerState}`,
  )
  if (!raw) return c.text("session expired", 400)
  const session = await verify(raw, c.env.BROKER_SIGNING_KEY)
  deleteCookie(c, `tb_oauth_${brokerState}`)

  // Exchange code for token using our client_secret — never sent to the app.
  const tokenRes = await fetch("https://api.vercel.com/v2/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: c.env.VERCEL_CLIENT_ID,
      client_secret: c.env.VERCEL_CLIENT_SECRET,
      code,
      redirect_uri: `${new URL(c.req.url).origin}/vercel/callback`,
    }),
  })
  if (!tokenRes.ok) {
    const body = await tokenRes.text()
    return c.redirect(
      `${session.loopback}?state=${encodeURIComponent(session.app_state)}&error=${encodeURIComponent(body.slice(0, 200))}`,
    )
  }
  const token = await tokenRes.json() as {
    access_token: string
    team_id?: string | null
  }

  const redirect = new URL(session.loopback as string)
  redirect.searchParams.set("state", session.app_state as string)
  redirect.searchParams.set("token", token.access_token)
  if (token.team_id) redirect.searchParams.set("team_id", token.team_id)
  return c.redirect(redirect.toString())
})

export default app
```

`wrangler.toml`:

```toml
name = "tiny-bell-broker"
main = "src/index.ts"
compatibility_date = "2026-01-01"

[vars]
# secrets go via `wrangler secret put` — never in this file:
#   BROKER_SIGNING_KEY, VERCEL_CLIENT_ID, VERCEL_CLIENT_SECRET, VERCEL_INTEGRATION_SLUG
```

### Security properties

- The loopback redirect is constrained to `http://127.0.0.1:<port>/...` by the `/:provider/authorize` handler. **Do not** skip this check — without it, an attacker can use your broker as an open redirect.
- The `state` parameter is validated both app-side (by the existing `extract_code` in `oauth.rs:59-76`) and broker-side (via the signed cookie).
- The broker never stores the access token — only proxies it.
- The `BROKER_SIGNING_KEY` is a 32-byte random value kept only in Cloudflare's secret store.
- Consider rate limiting per IP at the CF level (5 req/min/IP) — purely defensive.

### Observability

- Log every code→token exchange (without tokens) to Cloudflare Analytics.
- Alert if `>5%` of exchanges fail in a 5-minute window.

### Phase 2 deliverable

`auth.tinybell.app/health` returns 200. `auth.tinybell.app/vercel/authorize` works end-to-end against a *staging* Vercel integration with its own client ID. Desktop app unchanged.

---

## Phase 3 — Vercel → broker

### Rust changes

Replace `start_vercel_oauth` in `src-tauri/src/auth/vercel.rs:146-257` with a broker-mediated version. Key differences:

- No `CLIENT_SECRET` (`env!("VERCEL_CLIENT_SECRET")` — removed from `vercel.rs:12` and `build.rs:23-24`).
- No `TOKEN_URL` hit from the app.
- Authorize URL points at the broker, not vercel.com.
- Callback parser now reads `token` + `team_id` from query string instead of exchanging a `code`.

```rust
// src-tauri/src/auth/vercel.rs — replacement for start_vercel_oauth

const CLIENT_ID: &str = env!("VERCEL_CLIENT_ID");              // still used for the /v2/user API
const BROKER_BASE: &str = env!("TINY_BELL_BROKER_BASE");        // e.g. "https://auth.tinybell.app"

pub async fn start_vercel_oauth(app: AppHandle) -> Result<AccountProfile, AuthError> {
    if BROKER_BASE.is_empty() {
        return Err(AuthError::Config(
            "OAuth broker not configured — set TINY_BELL_BROKER_BASE at build time".into(),
        ));
    }

    let state = generate_state();
    let binding = oauth::spawn_loopback_server(state.clone())?;
    let redirect = redirect_uri_for(binding.port);

    let authorize_url = format!(
        "{BROKER_BASE}/vercel/authorize?redirect={ruri}&state={state}",
        ruri = urlencoding::encode(&redirect),
        state = urlencoding::encode(&state),
    );

    if let Err(e) = open_browser(&authorize_url) {
        oauth::abort_current();
        return Err(e);
    }

    let callback = tokio::time::timeout(
        std::time::Duration::from_secs(OAUTH_TIMEOUT_SECS),
        binding.code_rx,
    ).await;

    oauth::abort_current();

    // NOTE: for broker-mediated callbacks we need the raw params, not just
    // the code. Extend the loopback to surface the full HashMap — see
    // "Loopback parser extension" below.
    let params = match callback {
        Err(_) => return Err(AuthError::Timeout),
        Ok(Err(_)) => return Err(AuthError::ServerClosed),
        Ok(Ok(Err(e))) => return Err(e),
        Ok(Ok(Ok(CallbackPayload::Error(msg)))) => return Err(AuthError::Provider(msg)),
        Ok(Ok(Ok(CallbackPayload::Params(p)))) => p,
    };

    if let Some(err) = params.get("error") {
        return Err(AuthError::Provider(err.clone()));
    }
    let access_token = params.get("token")
        .cloned()
        .ok_or_else(|| AuthError::Provider("broker did not return a token".into()))?;
    let team_id = params.get("team_id").cloned();

    let profile = fetch_vercel_profile(&access_token, team_id.as_deref()).await?;
    let account_id = uuid::Uuid::new_v4().to_string();
    crate::keychain::store_token(Platform::Vercel.key(), &account_id, &access_token)?;
    let stored = StoredAccount {
        id: account_id.clone(),
        platform: Platform::Vercel,
        display_name: profile.display_name.clone(),
        scope_id: team_id.clone(),
        enabled: true,
        created_at: chrono::Utc::now().timestamp_millis(),
        health: AccountHealth::Ok,
        monitored_repos: None,
    };
    store::save_account(&app, &stored).map_err(AuthError::Store)?;
    let emitted = AccountProfile { id: account_id, ..profile };
    let _ = app.emit("oauth:complete", &emitted);
    Ok(emitted)
}
```

### Loopback parser extension

Today `oauth.rs:54-76` extracts only `code` + `state`. Add a second, richer variant that returns the full param map (needed so we can read `token` / `team_id` / `refresh_token` from broker callbacks):

```rust
// src-tauri/src/auth/oauth.rs — add alongside CallbackResult
pub enum CallbackPayload {
    Params(HashMap<String, String>),
    Error(String),
}

pub fn extract_payload(
    params: &HashMap<String, String>,
    expected_state: &str,
) -> Result<CallbackPayload, AuthError> {
    if let Some(err) = params.get("error") {
        let desc = params.get("error_description").cloned().unwrap_or_else(|| err.clone());
        return Ok(CallbackPayload::Error(desc));
    }
    let state = params.get("state").ok_or(AuthError::StateMismatch)?;
    if !constant_time_eq(state, expected_state) {
        return Err(AuthError::StateMismatch);
    }
    Ok(CallbackPayload::Params(params.clone()))
}
```

Keep `extract_code` and `CallbackResult` as-is for backward compat (Railway and the Phase-1 GitHub path don't need the full map). Or, cleaner: converge everything on `CallbackPayload` and adapt `railway.rs` to read `params.get("code")`. Either is fine; the second is slightly nicer for Phase 4.

### build.rs: drop the secret, add the broker base

```rust
// src-tauri/build.rs — diff
-    let client_secret = std::env::var("VERCEL_CLIENT_SECRET").unwrap_or_default();
+    let broker_base = std::env::var("TINY_BELL_BROKER_BASE").unwrap_or_default();
     let client_id = std::env::var("VERCEL_CLIENT_ID").unwrap_or_default();
     // ...
-    println!("cargo:rustc-env=VERCEL_CLIENT_SECRET={}", client_secret);
+    println!("cargo:rustc-env=TINY_BELL_BROKER_BASE={}", broker_base);
-    println!("cargo:rerun-if-env-changed=VERCEL_CLIENT_SECRET");
+    println!("cargo:rerun-if-env-changed=TINY_BELL_BROKER_BASE");
     // Warning:
     if profile == "release" && broker_base.is_empty() {
         println!(
             "cargo:warning=TINY_BELL_BROKER_BASE not set — OAuth broker flows (Vercel) will be disabled."
         );
     }
```

### Tauri CSP

`src-tauri/tauri.conf.json:48` currently has `connect-src` including `https://vercel.com`. That's fine — the browser hits the broker domain, not the app. The app itself only connects to `api.vercel.com` for profile/deployment calls after the token is in hand. **No CSP change needed.** (Confirm the broker's domain doesn't need to appear in `connect-src` — it doesn't, because the app opens it in the system browser via `tauri-plugin-opener`, not via `fetch`.)

### Vercel integration registration

- New integration on `vercel.com/dashboard/integrations/console` with:
  - Redirect URI: `https://auth.tinybell.app/vercel/callback`
  - Client ID/secret stored in the CF Worker's secret store.
- Deprecate the old integration (keep it alive for 30 days so existing users on older builds aren't cut off, then revoke).

### Phase 3 deliverable

Binary contains no `VERCEL_CLIENT_SECRET`. Vercel connect flow works for new users through the broker.

---

## Phase 4 — `AuthStrategy` trait refactor

Now that we have four flow variants in play (PAT, PKCE public client, device flow, broker-mediated), unify them behind a trait. This is internal cleanup with no behavior change — ship it in a quiet release.

### The trait

```rust
// src-tauri/src/auth/strategy.rs (new file)
use async_trait::async_trait;
use tauri::AppHandle;

use crate::adapters::{AccountProfile, Platform};
use crate::auth::AuthError;

/// What a provider's front-end can offer as a connect option.
#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethodKind {
    Pat,
    OauthLoopback,  // PKCE public client (Railway)
    OauthBroker,    // broker-mediated (Vercel)
    DeviceCode,     // device flow (GitHub)
}

#[async_trait]
pub trait AuthStrategy: Send + Sync {
    fn platform(&self) -> Platform;
    fn method(&self) -> AuthMethodKind;
    async fn connect(&self, app: AppHandle) -> Result<AccountProfile, AuthError>;
}
```

### Provider registry

```rust
// src-tauri/src/auth/strategy.rs (continued)
pub fn methods_for(platform: Platform) -> Vec<AuthMethodKind> {
    match platform {
        Platform::Vercel  => vec![AuthMethodKind::OauthBroker, AuthMethodKind::Pat],
        Platform::Railway => vec![AuthMethodKind::OauthLoopback, AuthMethodKind::Pat],
        Platform::GitHub  => vec![AuthMethodKind::DeviceCode, AuthMethodKind::Pat],
    }
}

/// Surface what's available to the UI so it can render the right tabs.
#[tauri::command]
pub async fn list_auth_methods(platform: String) -> Result<Vec<AuthMethodKind>, String> {
    Platform::from_key(&platform)
        .map(methods_for)
        .ok_or_else(|| format!("unknown platform {platform}"))
}
```

Register `list_auth_methods` in `lib.rs` `invoke_handler![]` (`lib.rs:98-132`).

### Call sites

The command layer (`src-tauri/src/commands/accounts.rs:60-79`) becomes a two-line dispatch:

```rust
#[tauri::command]
pub async fn start_oauth(app: AppHandle, platform: String) -> Result<AccountProfile, String> {
    let platform = Platform::from_key(&platform)
        .ok_or_else(|| format!("unknown platform {platform}"))?;
    let strategy = strategy::default_oauth_for(platform)
        .ok_or_else(|| format!("no OAuth flow for {:?}", platform))?;
    let profile = strategy.connect(app.clone()).await.map_err(|e| e.to_string())?;
    rehydrate_after_change(&app).await;
    Ok(profile)
}
```

Implementations are thin wrappers around the functions we already have:

```rust
// src-tauri/src/auth/strategy.rs
pub struct VercelBrokerStrategy;
#[async_trait]
impl AuthStrategy for VercelBrokerStrategy {
    fn platform(&self) -> Platform { Platform::Vercel }
    fn method(&self) -> AuthMethodKind { AuthMethodKind::OauthBroker }
    async fn connect(&self, app: AppHandle) -> Result<AccountProfile, AuthError> {
        crate::auth::vercel::start_vercel_oauth(app).await
    }
}
// similar for RailwayPkceStrategy, GitHubDeviceStrategy, PatStrategy (takes token+scope)

pub fn default_oauth_for(p: Platform) -> Option<Box<dyn AuthStrategy>> {
    match p {
        Platform::Vercel  => Some(Box::new(VercelBrokerStrategy)),
        Platform::Railway => Some(Box::new(RailwayPkceStrategy)),
        Platform::GitHub  => Some(Box::new(GitHubDeviceStrategy)),
    }
}
```

### Frontend consumes `list_auth_methods`

Replace the hard-coded OAuth/PAT toggle in `src/components/account/add-account-form.tsx:165-172` with a loop over the methods returned by `list_auth_methods(platform)`. Renders the right tab and picks the right default:

```tsx
const { data: methods = [] } = useAuthMethods(platform)   // new hook, calls invoke
const [mode, setMode] = useState<AuthMethodKind>(methods[0] ?? "pat")
useEffect(() => { if (methods[0]) setMode(methods[0]) }, [platform, methods])

return (
  <div className="inline-flex gap-0.5 rounded-[6px] border border-border bg-surface-2 p-0.5">
    {methods.map((m) => (
      <ModePill key={m} active={mode === m} onClick={() => setMode(m)}>
        {labelForMethod(m)}  {/* "OAuth", "Paste token", "Device code" */}
      </ModePill>
    ))}
  </div>
)
```

### Phase 4 deliverable

Adding a 4th provider is a checklist of: (1) implement `DeploymentMonitor`, (2) register in `adapters/registry.rs`, (3) register 1+ `AuthStrategy` implementations, (4) add to `methods_for`. No changes to the command layer, no changes to the UI except a brand mark.

---

## Phase 5 — Documentation, escape hatches, future-provider playbook

### Document the architecture

Add `docs/auth.md` (short — 2 pages). Cover:

- Why we don't ship `client_secret`s.
- Which providers use which flow and why.
- What the broker does and doesn't see.
- How to add a new provider (see playbook below).

### "Bring your own OAuth app" escape hatch (optional)

Power-user feature for paranoid users or outages. Behind a hidden setting. UI lives in `src/app/desktop/views/settings/accounts-tab.tsx`. Users paste their own `client_id`/`client_secret` into a per-provider field stored in the keychain vault under a special key like `byoauth:vercel`. The Vercel strategy checks for this first and falls back to the broker.

Skip this phase if effort is better spent elsewhere — PAT already covers the "broker is down" story.

### Playbook: adding a new provider

1. **Understand the provider's auth options.** In priority order:
   - Device Flow (GitHub-style) → `AuthMethodKind::DeviceCode`. No broker, no `client_secret`. **Pick this if available.**
   - Pure PKCE public client (Railway-style) → `AuthMethodKind::OauthLoopback`. No broker, `client_id` only. **Pick this if available.**
   - Authorization code requiring `client_secret` (Vercel-style) → `AuthMethodKind::OauthBroker`. Add a `/newprovider/authorize` + `/newprovider/callback` pair to the broker. Last resort.
2. **Always implement PAT too** (`AuthMethodKind::Pat`).
3. **Add the enum variant** in `src-tauri/src/adapters/mod.rs:13-17` and update `key()`/`from_key()` (as was done for GitHub).
4. **Implement `DeploymentMonitor`** under `src-tauri/src/adapters/<provider>/`.
5. **Implement the `AuthStrategy` impls** under `src-tauri/src/auth/<provider>.rs`.
6. **Register the strategies** in `methods_for` and `default_oauth_for`.
7. **Add to `AdapterRegistry::hydrate`** (`registry.rs:43-63`) and the `token_provider` refresh match (`token_provider.rs:23-38`).
8. **Frontend** — add the platform to `src/lib/accounts.ts:3` union, add the brand mark, add the token link config.
9. **CSP / capabilities** — extend `tauri.conf.json` `connect-src` + `img-src` if the provider has different hosts.

---

## Phase 6 — Release-engineering

### Secrets in CI

- Build pipeline (GitHub Actions or similar) must have **only**:
  - `VERCEL_CLIENT_ID` (public, fine to leak)
  - `VERCEL_INTEGRATION_SLUG` (public)
  - `RAILWAY_CLIENT_ID` (public)
  - `GITHUB_CLIENT_ID` (public)
  - `TINY_BELL_BROKER_BASE` (public, e.g. `https://auth.tinybell.app`)
- Delete `VERCEL_CLIENT_SECRET` and `GITHUB_CLIENT_SECRET` from CI secrets once Phase 1 and Phase 3 ship. Set a calendar reminder to rotate them one last time before deletion in case the old values got mirrored anywhere.

### `.env.example` final state

```dotenv
# Public identifiers — safe to ship in the binary
VERCEL_CLIENT_ID=
VERCEL_INTEGRATION_SLUG=
RAILWAY_CLIENT_ID=
GITHUB_CLIENT_ID=

# OAuth broker base URL (no trailing slash)
TINY_BELL_BROKER_BASE=https://auth.tinybell.app
```

### Broker repo

- Keep it in a separate repo (`tiny-bell-broker`) — different deployment cadence, different secrets, different reviewers.
- Pin the Wrangler version. Dependabot on. CI deploys on merge to `main`.
- Staging worker at `auth-staging.tinybell.app` with its own set of client IDs.

### Outage plan

If the broker is down:

- **GitHub** unaffected (device flow, no broker).
- **Railway** unaffected (PKCE, no broker).
- **Vercel** connect breaks. Existing Vercel users are unaffected — their tokens are already in the keychain and `token_provider::get_fresh_access_token` (`token_provider.rs:38`) hands the stored access token through unchanged.
- UI falls back to PAT automatically when `startOAuth` returns a `Config` error or a network error against the broker. Message: "OAuth is temporarily unavailable — paste a token instead."

---

## 5. Migration notes

### Existing users

`StoredAccount` in `store.rs` and `StoredSecret` in `keychain.rs` don't change shape. Existing Vercel and GitHub tokens in the keychain vault keep working — `token_provider::get_fresh_access_token` doesn't care how the token was obtained. **No migration code required.**

### Version gating

- Phase 1 can ship in any version.
- Phase 3 requires the broker to be live. Ship broker → verify with staging client → roll out desktop release.
- If a user on an old build with the old GitHub OAuth flow tries to reconnect, they hit the device-flow path after updating. No data loss.

---

## 6. Testing checklist

### Rust unit tests (wiremock)

- `github.rs` — device code happy path, `authorization_pending`, `slow_down`, `expired_token`, `access_denied` (Phase 1).
- `vercel.rs` — broker callback parsing: token present, team_id present, error present (Phase 3).
- `oauth.rs` — `extract_payload` state mismatch, error branch, full param passthrough (Phase 3).
- `strategy.rs` — `methods_for` returns the expected tuple per platform (Phase 4).

### Manual end-to-end

- Fresh install → connect Vercel via broker → deployment feed populates.
- Fresh install → connect GitHub via device code → repo picker populates.
- Broker down (point `TINY_BELL_BROKER_BASE` at `https://localhost:1`) → UI falls back gracefully.
- Extract built `.app` on macOS, run `strings Tiny\ Bell.app/Contents/MacOS/tiny-bell | grep -iE 'secret|client_secret|ghp_|vcl_'` → zero hits (sanity check for Phases 1 + 3).
- Existing user upgrade path — install old version, connect all three, upgrade, verify all three still work without re-auth.

### Broker tests

- `/health` returns 200.
- `/vercel/authorize` rejects non-loopback `redirect` values.
- `/vercel/callback` rejects expired cookies.
- `/vercel/callback` never echoes the `client_secret` in error responses.

---

## 7. Out of scope

- **Encrypting tokens at rest beyond what the OS keychain provides.** Keychain is the gold standard on macOS/Windows/Linux; we don't need a second layer.
- **Token rotation scheduling.** Vercel and GitHub tokens currently don't expire (or have very long lifetimes). Revisit if we add a provider with short-lived tokens that doesn't support refresh.
- **Telemetry.** The broker can log exchanges for debugging, but we deliberately do not phone home from the desktop app.
- **Multi-tenant broker as a product.** The broker is an implementation detail of Tiny Bell, not something third parties will point their apps at.

---

## 8. Effort estimate

Rough, in ideal-developer-days:

| Phase | Effort |
|---|---|
| 1 — GitHub device flow | 1–1.5 days |
| 2 — Broker infra + Vercel staging integration | 1–2 days |
| 3 — Vercel cut-over | 1 day |
| 4 — `AuthStrategy` refactor | 1–1.5 days |
| 5 — Docs + escape hatch | 0.5–1 day |
| 6 — Release-engineering + rotation | 0.5 day |
| **Total** | **~6–8 days** |

The broker is ~150 lines of TypeScript. The Rust changes are mostly localized to `src-tauri/src/auth/` and don't touch the adapter, poller, cache, tray, or window layers.

---

## 9. Summary

End state: **no `client_secret` ships in the binary**, for any provider.

- **GitHub** uses device flow — no secret, no broker, better UX, works out of the box.
- **Railway** is unchanged — it's already a pure PKCE public client; `RAILWAY_CLIENT_ID` is a public identifier.
- **Vercel** goes through a stateless Cloudflare Worker broker that holds the only copy of `VERCEL_CLIENT_SECRET`. Tokens pass through the broker but are never stored server-side.
- **Every provider** keeps PAT as a permanent fallback, so users are never stranded by a broker outage or a revoked OAuth app.
- **New providers** slot in via the `AuthStrategy` trait + `methods_for` registry — pick whichever flows the provider supports, PAT always included.
