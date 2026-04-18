# Dev Radio

> _Tune in to your deploys._

A lightweight, native-feeling desktop menu-bar app that monitors real-time build & deployment status for **Vercel** and **Railway**. Built with Tauri v2 + React 19 + shadcn/ui.

## Stack

- **Frontend** — React 19, TypeScript, Vite, shadcn/ui, TailwindCSS
- **Backend** — Rust (Tauri v2), adapter pattern over cloud APIs
- **Secrets** — OS keychain only (macOS Keychain, Windows Credential Manager, Linux Secret Service)

## First run

1. Install the DMG / MSI / AppImage for your platform.
2. Launch Dev Radio.
3. Click **Add account** and follow [Connecting Accounts](docs/connecting-accounts.md) to link Vercel and/or Railway.

## Development

```bash
pnpm install
pnpm tauri dev
```

Optional: register a Vercel dev integration at <https://vercel.com/dashboard/integrations/console> with redirect URI `http://127.0.0.1:53123/callback` and set:

```bash
# .env.local (git-ignored)
VERCEL_CLIENT_ID=...
VERCEL_CLIENT_SECRET=...
```

Without these, OAuth is disabled but **paste-token** still works for both platforms.

### Tests & typecheck

```bash
pnpm typecheck          # TypeScript
cd src-tauri && cargo test --lib
```

## Architecture

See [plan.md](plan.md) for the full implementation plan. Key modules:

- `src-tauri/src/adapters/` — `Platform`, domain models (`Project`, `Deployment`, `AccountProfile`).
- `src-tauri/src/auth/` — OAuth (PKCE + loopback) and PAT flows.
- `src-tauri/src/keychain.rs` — OS keychain wrapper.
- `src-tauri/src/store.rs` — persisted account metadata (tokens are **not** stored here).
- `src-tauri/src/commands/accounts.rs` — Tauri invoke surface.
- `src/components/account/` — React UI for connecting and listing accounts.
- `src/lib/accounts.ts` — typed Tauri command wrappers.

## Security

- Tokens live in the OS keychain and are never written to disk, logs, or frontend memory after initial paste.
- All logs pass through a redactor (`src-tauri/src/redact.rs`) that filters common secret patterns.
- Content-Security-Policy restricts outbound `connect-src` to Vercel and Railway API hosts.

## License

TBD.
