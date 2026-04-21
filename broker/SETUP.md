# Broker setup

One-time setup to deploy the Tiny Bell OAuth broker to Cloudflare Workers.

## 1. Cloudflare account

1. Sign up at <https://dash.cloudflare.com/sign-up> (free tier is plenty — the broker fits in Workers' free 100k req/day).
2. From the dashboard sidebar, open **Workers & Pages** once so the workers subdomain (`<your-handle>.workers.dev`) is provisioned.

## 2. Find your account ID

- Dashboard → **Workers & Pages** → right sidebar shows **Account ID**. Copy it.

## 3. Create an API token for CI

- Dashboard → top-right profile menu → **My Profile** → **API Tokens** → **Create Token**.
- Pick the **Edit Cloudflare Workers** template.
- Under **Account Resources**, select your account.
- Under **Zone Resources**, pick **All zones** (or the one you'll use for a custom domain).
- **Continue** → **Create Token** → copy it (you'll only see it once).

## 4. First local deploy

From your machine, authenticate wrangler once and push the initial build so the worker exists before you set its secrets:

```bash
cd broker
pnpm install
pnpm exec wrangler login        # opens browser, OAuth into your Cloudflare account
pnpm deploy                     # creates `tiny-bell-broker` worker
pnpm deploy:staging             # creates `tiny-bell-broker-staging` worker
```

You now have two workers at:

- `https://tiny-bell-broker.<your-handle>.workers.dev`
- `https://tiny-bell-broker-staging.<your-handle>.workers.dev`

Visiting `.../health` should return `{ "ok": true }`.

## 5. Set worker secrets

From the `broker/` directory, run `wrangler secret put` once per secret per environment. Each command prompts you to paste the value.

```bash
# Production
pnpm exec wrangler secret put BROKER_SIGNING_KEY          --env production
pnpm exec wrangler secret put VERCEL_CLIENT_ID            --env production
pnpm exec wrangler secret put VERCEL_CLIENT_SECRET        --env production
pnpm exec wrangler secret put VERCEL_INTEGRATION_SLUG     --env production

# Staging (use separate Vercel OAuth integration)
pnpm exec wrangler secret put BROKER_SIGNING_KEY          --env staging
pnpm exec wrangler secret put VERCEL_CLIENT_ID            --env staging
pnpm exec wrangler secret put VERCEL_CLIENT_SECRET        --env staging
pnpm exec wrangler secret put VERCEL_INTEGRATION_SLUG     --env staging
```

For `BROKER_SIGNING_KEY`, generate a fresh value:

```bash
openssl rand -base64 32
```

## 6. Register the Vercel integration

- Go to <https://vercel.com/dashboard/integrations/console>.
- Create a new integration.
  - **Redirect URL**: `https://tiny-bell-broker.<your-handle>.workers.dev/vercel/callback` (and a staging one pointing at the staging worker).
  - Copy the **Client ID**, **Client Secret**, and **Slug** — these are the values you just pasted into the worker secrets.

## 7. Add GitHub Actions secrets

Repository → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**:

| Secret | Value |
|---|---|
| `CLOUDFLARE_API_TOKEN` | from step 3 |
| `CLOUDFLARE_ACCOUNT_ID` | from step 2 |

That's all the deploy job needs — the worker's own secrets (VERCEL_*, BROKER_SIGNING_KEY) live in Cloudflare, not GitHub.

While you're here, also set the desktop-build secrets so release builds can point at the broker:

| Secret | Value |
|---|---|
| `VERCEL_CLIENT_ID_PROD` | public Vercel client ID |
| `RAILWAY_CLIENT_ID_PROD` | public Railway client ID |
| `GH_OAUTH_CLIENT_ID_PROD` | public GitHub OAuth App client ID (Device Flow enabled) |
| `TINY_BELL_BROKER_BASE_PROD` | `https://tiny-bell-broker.<your-handle>.workers.dev` |

## 8. Verify CI

Push a trivial change under `broker/` to main. The `Broker` workflow should:

1. Run `pnpm typecheck` + `pnpm test`.
2. Deploy to production via `wrangler deploy --env production`.

Check the job logs; a successful deploy prints the deployed URL.

## Optional: custom domain

To put the broker behind `auth.tinybell.app` (or any domain you own on Cloudflare):

1. Add the domain as a **Zone** in Cloudflare (dashboard → **Add a site**).
2. In the worker's **Settings** → **Triggers** → **Custom Domains**, add `auth.tinybell.app`.
3. Update `TINY_BELL_BROKER_BASE_PROD` in GitHub Actions secrets to the new URL.
4. Update the Vercel integration's redirect URL to `https://auth.tinybell.app/vercel/callback`.
5. Ship a new desktop build — the next release will open `auth.tinybell.app` instead of the workers.dev URL.

## Rotating secrets

If you suspect a secret has leaked:

```bash
# Rotate the signing key — invalidates any in-flight auth sessions
openssl rand -base64 32 | pnpm exec wrangler secret put BROKER_SIGNING_KEY --env production

# Rotate the Vercel client secret — requires a new integration on Vercel's side first
pnpm exec wrangler secret put VERCEL_CLIENT_SECRET --env production
```

Because desktop binaries never held these values, no client-side rebuild is needed.

