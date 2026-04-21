# tiny-bell-broker

Stateless OAuth broker for [Tiny Bell](../). Runs on Cloudflare Workers and holds provider `client_secret` values so they never ship in the desktop binary.

## What it does

For providers that require a confidential `client_secret` in the token exchange (currently only Vercel):

1. Tiny Bell opens `${BROKER_BASE}/vercel/authorize?redirect=<loopback>&state=<s>` in the user's browser.
2. The broker signs a short-lived cookie binding this in-flight auth to the loopback URL, then redirects to Vercel's authorize endpoint with the broker's redirect URI.
3. Vercel sends the user back to `${BROKER_BASE}/vercel/callback?code=...`.
4. The broker exchanges the code for an access token using its `client_secret` and redirects the user to the original loopback with `?token=...`.

**Tokens pass through the broker but are never stored.** The only persistent secrets are the provider `client_secret`s, which live only in the Cloudflare secret store.

## Provider coverage

| Provider | Why broker? |
|---|---|
| Vercel   | Requires `client_secret` in token exchange. |
| Railway  | Not needed — pure PKCE public client (see `src-tauri/src/auth/railway.rs`). |
| GitHub   | Not needed — uses Device Flow (see `src-tauri/src/auth/github.rs`). |

New providers land here only if they require `client_secret` **and** have no device flow.

## Development

```bash
pnpm install
pnpm dev           # wrangler dev on http://localhost:8787
pnpm test          # vitest
pnpm typecheck     # tsc --noEmit
```

## Deploying

First-time setup: follow [SETUP.md](./SETUP.md) once to provision the Cloudflare account, API token, worker secrets, and GitHub Actions secrets.

After that, merges to `main` that touch `broker/**` auto-deploy to production via `.github/workflows/broker.yml`.

## Secrets

Set once per environment:

```bash
wrangler secret put BROKER_SIGNING_KEY      # 32+ bytes of base64 entropy
wrangler secret put VERCEL_CLIENT_ID
wrangler secret put VERCEL_CLIENT_SECRET
wrangler secret put VERCEL_INTEGRATION_SLUG
```

For staging:

```bash
wrangler secret put BROKER_SIGNING_KEY --env staging
# ... repeat for other secrets
```

## Deploy

```bash
pnpm deploy:staging    # auth-staging.tinybell.app
pnpm deploy            # auth.tinybell.app
```

## Security properties

- **Loopback allowlist** — the authorize endpoint rejects any `redirect` that is not `http://127.0.0.1:<53000-53999>/callback` or `http://localhost:<53000-53999>/callback`. Without this, the broker would be an open redirect.
- **State binding** — the `state` param the app supplies is stored in a signed cookie keyed by a fresh `state` the broker picks. The callback validates both.
- **No persistence** — nothing writes to KV, D1, or DO. The broker is fully stateless beyond the in-flight cookie.
- **No logging of tokens** — error paths surface only the provider's error string, truncated to 200 chars.
