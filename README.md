<p align="center">
  <img src="./public/app-icon.png" alt="Tiny Bell" width="128" height="128" />
</p>

<h1 align="center">Tiny Bell</h1>

<p align="center"><em>Tune in to your deploys.</em></p>

A quiet menubar app that monitors real-time build & deployment status for **Vercel**, **Railway**, and **GitHub Actions**. Built with Tauri v2 + React 19 + TypeScript.

## Screenshots

<p align="center">
  <img src="./screenshots/deployments.png" alt="Deployment feed" width="380" />
</p>

<p align="center">
  <img src="./screenshots/accounts.png" alt="Connected accounts" width="520" />
  <br />
  <em>Settings → Accounts</em>
</p>

<p align="center">
  <img src="./screenshots/add-account.png" alt="Add account dialog" width="520" />
  <br />
  <em>Connect via OAuth or paste-token</em>
</p>

## Status

- **Platforms supported:** macOS (Apple Silicon + Intel). Windows/Linux builds are out of scope for v1.
- **Builds are unsigned.** The developer hasn't enrolled in the Apple Developer Program yet, so macOS will warn that the app is from an unidentified developer. See [Installing an unsigned build](#installing-an-unsigned-build) below.
- **Open source** under MIT (see [LICENSE](./LICENSE)).

## First run

1. Download the DMG for your architecture from the latest [release](https://github.com/trankhacvy/tiny-bell/releases).
2. Install, then see [Installing an unsigned build](#installing-an-unsigned-build) to bypass Gatekeeper.
3. Launch Tiny Bell from Applications or Spotlight.
4. Click the tray icon → **Add account**, then follow the provider-specific flow (OAuth or paste-token).

### Installing an unsigned build

Because the build isn't signed with an Apple Developer ID, macOS treats it as coming from an "unidentified developer". Two options:

**Right-click to open** (one-time per install):

1. Drag Tiny Bell into Applications.
2. Right-click (or Ctrl-click) the app → **Open** → **Open** again in the confirmation dialog.

**Or, strip the quarantine attribute:**

```bash
xattr -dr com.apple.quarantine /Applications/Tiny\ Bell.app
```

After either, the app launches normally on subsequent runs.

## Stack

- **Frontend** — React 19, TypeScript, Vite, Tailwind v4, shadcn/ui, lucide-react
- **Backend** — Rust (Tauri v2), adapter pattern over cloud APIs, tokio + reqwest
- **Secrets** — OS keychain only (macOS Keychain, never on disk)
- **OAuth broker** — stateless Cloudflare Worker (`./broker/`) that holds provider `client_secret`s so they never ship in the desktop binary

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
- `broker/` — Cloudflare Worker that brokers OAuth flows requiring a `client_secret`. See [broker/SETUP.md](./broker/SETUP.md) for one-time Cloudflare setup.
- `src/components/` — React UI.

## Authentication model

Tiny Bell ships as a distributed binary. **No provider `client_secret` is compiled into the binary** — any secret shipped this way is effectively public (`strings`, a hex editor, or mitmproxy extract it in minutes).

Each provider picks one of four flows, based on what the provider itself supports:

| Provider | Flow | Needs broker? |
|---|---|---|
| **Vercel** | Broker-mediated OAuth (Cloudflare Worker holds `client_secret`) | Yes |
| **Railway** | Pure PKCE public client (no secret involved) | No |
| **GitHub** | OAuth Device Flow (no secret involved) | No |
| *All three* | Paste-token (PAT) fallback, always available | No |

The broker is stateless: it does the code→token exchange on your behalf and forwards the token to a loopback URL on your machine. Tokens never persist server-side.

## Security

- Tokens live in the OS keychain and are never written to disk or log files after initial paste.
- All logs pass through a redactor (`src-tauri/src/redact.rs`) that masks common secret patterns (Bearer headers, `client_secret`, `access_token`, etc.).
- Content-Security-Policy restricts outbound `connect-src` to the three provider API hosts.
- The binary contains no provider `client_secret`s — they live only in the broker's Cloudflare Workers secret store.

## Contributing

Issues and PRs welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## License

[MIT](./LICENSE) © Khac Vy
