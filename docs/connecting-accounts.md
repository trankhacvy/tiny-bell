# Connecting Accounts

Dev Radio supports connecting multiple **Vercel**, **Railway**, and **GitHub** accounts simultaneously. Each account's credentials are stored only in your operating system's keychain — they never leave your machine and never touch disk in plain text.

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

## Railway — two ways to connect

### 1. Connect with Railway (OAuth, recommended)

Same loopback + PKCE flow as Vercel, built on Railway's native OAuth app.

1. Click **Add account** → pick the **Railway** tab → **Connect with Railway**.
2. Your default browser opens Railway's approval screen.
3. Pick which workspaces (or individual projects) to grant Dev Radio read access to.
4. Browser tab auto-closes; Dev Radio confirms the connection.

Scopes requested: `openid email profile offline_access workspace:viewer project:viewer`. Access tokens expire every hour; Dev Radio refreshes them silently using the stored refresh token. If the refresh token is ever rejected (e.g. you revoked Dev Radio from Railway), the account is flagged as **Needs reconnect**.

### 2. Paste a Railway API token

If OAuth isn't available in your build or your org disallows it:

1. Visit <https://railway.com/account/tokens>.
2. Create a new token — select **No workspace** to make it account-scoped.
3. Click **Add account** → **Railway** tab → **Paste token** → paste and connect.

## GitHub — two ways to connect

### 1. Connect with GitHub (OAuth, recommended)

Same loopback flow as Vercel and Railway.

1. Click **Add account** → pick the **GitHub** tab → **Connect with GitHub**.
2. Your default browser opens GitHub's authorization screen.
3. Approve Dev Radio.
4. Browser tab auto-closes; Dev Radio confirms the connection.

GitHub OAuth tokens do not expire — no refresh is needed.

After connecting, Dev Radio shows a **repository selector** listing your repos sorted by recent activity. Select which repos (up to 30) to monitor for workflow runs. You can change this later from **Settings → Accounts → Manage repositories**.

### 2. Paste a GitHub Personal Access Token

1. Visit <https://github.com/settings/tokens> and create a new token.
   - **Classic token**: select `repo` and `read:user` scopes.
   - **Fine-grained token**: grant repository access and Actions (read-only) permission.
2. Click **Add account** → **GitHub** tab → **Paste token** → paste and connect.

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
| "OAuth is not configured in this build." | Your build does not include `VERCEL_CLIENT_ID` or `RAILWAY_CLIENT_ID`. | Use the **Paste token** option, or build with the env vars set. |
| "Port 53123 in use" | Another app is holding the loopback port. | Close the other app, then retry. Dev Radio automatically tries 53124 / 53125 as fallbacks. |
| Railway token rejected with "Invalid token" | PAT revoked or missing scopes. | Create a new token, or connect with OAuth instead. |
| "Your Railway session expired. Please reconnect." | Refresh token was rejected (revoked or older-than-rotated). | Remove the account and reconnect with OAuth. |
| GitHub shows no repositories | Token lacks `repo` scope, or fine-grained token has no repository access. | Create a new token with the required scopes. |
| GitHub rate limit hit | Polling too many repos. | Reduce monitored repos (max 30) from Settings → Manage repositories. |
