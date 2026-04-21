# Authentication architecture

Tiny Bell is distributed as a signed binary to end users. Anything compiled into that binary is, in practice, public: `strings`, mitmproxy, or a debugger will surface it in minutes. This document explains how we keep provider OAuth `client_secret`s out of the binary while still offering first-class OAuth UX.

## The rule

**Never embed a `client_secret` in the desktop binary.**

Every provider ends up in exactly one of four flows. Which one depends on what the provider itself supports:

| Kind (`AuthMethodKind`) | Requires `client_secret`? | Where it runs | Used by |
|---|---|---|---|
| `pat`             | — (user supplies token) | In the app | All providers (fallback) |
| `oauth_loopback`  | No (PKCE public client) | In the app + loopback | Railway |
| `device_code`     | No (device flow spec)   | In the app + provider | GitHub |
| `oauth_broker`    | **Yes** — kept in broker | In the app + [broker](../broker/) | Vercel |

A provider only lands on `oauth_broker` if it requires `client_secret` **and** has no device flow. Vercel is the only one today.

## Per-provider details

### Vercel — `oauth_broker`

1. App generates a `state` and spawns the loopback server (`src-tauri/src/auth/oauth.rs:spawn_loopback_server_payload`).
2. App opens `${TINY_BELL_BROKER_BASE}/vercel/authorize?redirect=<loopback>&state=<s>` in the browser.
3. Broker signs a short-lived cookie binding this session to the loopback, redirects the user to Vercel with the broker's own redirect URI.
4. Vercel sends the user back to `${BROKER_BASE}/vercel/callback`.
5. Broker exchanges the code for a token using its `VERCEL_CLIENT_SECRET`, then redirects to the loopback with `?token=...&team_id=...`.
6. App reads the token from the loopback query, stores it in the OS keychain.

See `src-tauri/src/auth/vercel.rs` and `broker/src/index.ts`.

### Railway — `oauth_loopback`

Pure PKCE public client. Only `RAILWAY_CLIENT_ID` is embedded (public identifier, like a username). Token exchange posts `client_id` + `code` + `code_verifier`. No `client_secret` at any step.

See `src-tauri/src/auth/railway.rs`.

### GitHub — `device_code`

Uses [OAuth Device Flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow). The app asks GitHub for a `user_code`, shows it to the user, opens `github.com/login/device`, and polls the token endpoint until the user approves. No `client_secret` is used. **Enable the "Device Flow" checkbox** on the OAuth App settings page on github.com.

See `src-tauri/src/auth/github.rs`.

### PAT — every provider

Always available as a fallback. Paste a token into the settings UI; `connect_with_token` validates it against the provider's `/user` endpoint and stores it in the OS keychain.

See `src-tauri/src/auth/pat.rs`.

## Where the method choice lives

`src-tauri/src/auth/strategy.rs`:

- `AuthMethodKind` — the four values above.
- `methods_for(Platform) -> Vec<AuthMethodKind>` — what's available for a given provider, based on whether the OAuth flow is configured at build time.
- `start_oauth(Platform, AppHandle)` — the single dispatch point for OAuth connect flows.

The Tauri command `list_auth_methods` surfaces `methods_for` to the UI, and the `AddAccountForm` uses the result to decide whether to show the OAuth tab at all.

## Build-time env vars (none are secret)

```dotenv
VERCEL_CLIENT_ID=
RAILWAY_CLIENT_ID=
GITHUB_CLIENT_ID=
TINY_BELL_BROKER_BASE=https://auth.tinybell.app
```

All four are public identifiers. Leaking any of them to a user's disk is fine. None of them is a `client_secret`.

The real secrets — `VERCEL_CLIENT_SECRET`, the broker's signing key — live only in the Cloudflare Worker's secret store, set via `wrangler secret put`.

## The broker contract

- **Stateless.** No KV, D1, or Durable Objects. Tokens pass through; nothing persists.
- **Loopback allowlist.** Broker rejects any `redirect` that isn't `http://{127.0.0.1|localhost}:{53000-53999}/callback`. Without this, the broker is an open redirect.
- **State binding.** `state` is checked both broker-side (via signed cookie) and app-side (via `extract_payload`).
- **Truncated errors.** Provider error strings are truncated to 200 chars before being echoed back, so no unbounded provider output reaches the app.

## Outage behavior

If the broker is down:

- **GitHub** and **Railway** are unaffected — neither uses the broker.
- **Vercel new-connects** fail with `AuthError::Server(...)` and the UI falls back to the PAT tab.
- **Existing Vercel users** are unaffected — tokens are already in the keychain and `token_provider::get_fresh_access_token` passes them through unchanged.

## Adding a new provider

Checklist when a new platform is added to `Platform` in `src-tauri/src/adapters/mod.rs`:

1. **Pick the flow**, in priority order:
   - Device Flow if available → `AuthMethodKind::DeviceCode`. No broker, no secret.
   - Pure PKCE public client → `AuthMethodKind::OauthLoopback`. No broker, no secret.
   - Authorization-code with required `client_secret` → `AuthMethodKind::OauthBroker`. Add a `/newprovider/authorize` + `/newprovider/callback` pair to `broker/src/index.ts`.
2. **Always ship PAT too** (`AuthMethodKind::Pat`).
3. **Implement the adapter** (`DeploymentMonitor`) under `src-tauri/src/adapters/<provider>/`.
4. **Implement the OAuth entry point** under `src-tauri/src/auth/<provider>.rs` (exposing `start_<provider>_oauth(AppHandle)` and `is_configured()`).
5. **Register in `strategy::methods_for`** and `strategy::start_oauth`.
6. **Register in `AdapterRegistry::hydrate`** (`src-tauri/src/adapters/registry.rs`) and in `token_provider` (if the provider refreshes tokens).
7. **Frontend** — add the platform to `src/lib/accounts.ts:Platform`, `PLATFORM_LABEL`, brand mark, and token link config.
8. **CSP / capabilities** — extend `src-tauri/tauri.conf.json`'s `connect-src` and `img-src` if the provider has new hosts.
