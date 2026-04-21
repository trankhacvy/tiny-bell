# Tiny Bell

> _Tune in to your deploys._

A lightweight, native-feeling desktop menu-bar app that monitors real-time build & deployment status for **Vercel**, **Railway**, and **GitHub Actions**. Built with Tauri v2 + React 19 + shadcn/ui.

## Stack

- **Frontend** — React 19, TypeScript, Vite, shadcn/ui, TailwindCSS
- **Backend** — Rust (Tauri v2), adapter pattern over cloud APIs
- **Secrets** — OS keychain only (macOS Keychain, Windows Credential Manager, Linux Secret Service)
- **OAuth broker** — stateless Cloudflare Worker (`./broker/`) that holds provider `client_secret`s so they never ship in the desktop binary

## First run

1. Install the DMG / MSI / AppImage for your platform.
2. Launch Tiny Bell.
3. Click **Add account** and follow [Connecting Accounts](docs/connecting-accounts.md).

## Development

```bash
pnpm install
pnpm tauri dev
```

### Optional env (all public — nothing secret at build time)

Copy `.env.example` → `.env.local` and fill in whichever OAuth flows you want enabled in dev:

```bash
VERCEL_CLIENT_ID=           # public identifier
RAILWAY_CLIENT_ID=          # public identifier (PKCE public client)
GITHUB_CLIENT_ID=           # public identifier (Device Flow)
TINY_BELL_BROKER_BASE=      # URL of the deployed broker (see ./broker/)
```

Any combination you leave blank simply disables that provider's OAuth path; paste-token still works everywhere.

### Tests & typecheck

```bash
pnpm typecheck                              # TypeScript
cd src-tauri && cargo test --lib            # Rust unit tests
cd broker && pnpm typecheck && pnpm test    # broker
```

## Architecture

- `src-tauri/src/adapters/` — `Platform`, domain models (`Project`, `Deployment`, `AccountProfile`), per-platform adapters.
- `src-tauri/src/auth/` — OAuth flows (broker-mediated, PKCE loopback, device code) and PAT. Entry point: `strategy.rs`.
- `src-tauri/src/keychain.rs` — OS keychain wrapper (unified vault).
- `src-tauri/src/store.rs` — persisted account metadata (tokens are **not** stored here).
- `src-tauri/src/commands/` — Tauri invoke surface.
- `broker/` — Cloudflare Worker that brokers OAuth flows requiring a `client_secret`.
- `src/components/account/` — React UI for connecting and listing accounts.

See [docs/auth.md](docs/auth.md) for the authentication architecture in detail, including the rule that **no `client_secret` ever ships in the binary** and the playbook for adding new providers.

## Security

- Tokens live in the OS keychain and are never written to disk, logs, or frontend memory after initial paste.
- All logs pass through a redactor (`src-tauri/src/redact.rs`) that masks common secret patterns.
- Content-Security-Policy restricts outbound `connect-src` to the three provider API hosts.
- The binary contains no provider `client_secret`s — they live only in the broker's Cloudflare Workers secret store.

## License

TBD.
