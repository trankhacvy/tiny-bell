# Connecting Accounts

Dev Radio supports connecting multiple **Vercel** and **Railway** accounts simultaneously. Each account's credentials are stored only in your operating system's keychain — they never leave your machine and never touch disk in plain text.

## Vercel — two ways to connect

### 1. Connect with Vercel (OAuth, recommended)

This opens your browser to Vercel's approval screen. Dev Radio never sees your Vercel password.

1. Click **Add account** → pick the **Vercel** tab → **Sign in with Vercel**.
2. Your default browser opens Vercel.
3. Approve the **Dev Radio** integration for the scope you want (personal or a team).
4. Browser tab auto-closes; Dev Radio confirms the connection.

Under the hood, Dev Radio runs a short-lived loopback server on `127.0.0.1:53123` (with fallback ports `53124` and `53125`) to receive the redirect. PKCE protects the token exchange.

### 2. Paste a Personal Access Token

If your company disallows third-party OAuth integrations, or you simply prefer tokens:

1. Visit <https://vercel.com/account/tokens> and create a new token.
2. Click **Add account** → **Vercel** tab → **Paste token**.
3. Paste the token.
4. (Optional) Paste a **Team ID** (e.g. `team_xxx`) if the token is scoped to a team.

## Railway — paste a token

Railway does not offer OAuth for third-party desktop apps. To connect:

1. Visit <https://railway.app/account/tokens>.
2. Create a new API token.
3. Click **Add account** → **Railway** tab → paste the token.

## Where are tokens stored?

- **macOS** — Keychain (`dev-radio` service).
- **Windows** — Windows Credential Manager.
- **Linux** — Secret Service (requires `libsecret`; on GNOME this is the default).

Tokens are never written to log files. Dev Radio's log pipeline runs a redactor that filters `token`, `access_token`, `authorization`, `code`, `client_secret`, `code_verifier`, and `password` keys before anything is persisted.

## Removing or rotating a token

- Delete an account from **Settings → Accounts → Remove**. The keychain entry is purged automatically.
- To rotate, delete the account and add it again with the new token.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "Didn't receive approval — try again" | You closed the browser tab before approving, or waited longer than 5 minutes. | Try again. |
| "Security check failed. Please try again." | CSRF `state` did not match. | Re-start the flow; do not reuse a stale browser tab. |
| "OAuth is not configured in this build." | Your build does not include `VERCEL_CLIENT_ID`. | Use the **Paste token** option, or build with the env vars set. |
| "Port 53123 in use" | Another app is holding the loopback port. | Close the other app, then retry. Dev Radio automatically tries 53124 / 53125 as fallbacks. |
| Railway token rejected with "Invalid token" | Token revoked or missing scopes. | Create a new token. |
