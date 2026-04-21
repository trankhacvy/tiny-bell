# Contributing

Thanks for your interest. Bug reports, small fixes, and new provider adapters are all welcome.

## Bug reports

Open an issue with:

- **Version** (Tiny Bell → Settings → About shows it).
- **OS** (macOS version, Apple Silicon vs Intel).
- **Steps to reproduce**.
- **Expected vs. actual behavior**.
- **Relevant log output** from `~/Library/Logs/com.khacvy.tiny-bell/Tiny Bell.log` (redactor strips common secrets, but double-check before pasting).

## Local setup

```bash
pnpm install
pnpm tauri dev
```

Before submitting a PR:

```bash
pnpm typecheck
cd src-tauri && cargo test --lib
cd broker && pnpm typecheck && pnpm test    # only if broker/** changed
```

## PR guidelines

- One logical change per PR. If a refactor and a feature share a PR, it's harder to review and harder to revert.
- Follow the existing commit-message style ([Conventional Commits](https://www.conventionalcommits.org/)): `feat(scope): …`, `fix(scope): …`, `refactor(scope): …`.
- No `any` or `unknown` in new TypeScript unless validating untrusted input at a boundary.
- Don't ship new comments unless they explain *why*; names + types already explain *what*.

## Adding a new provider

See the "Adding a new provider" checklist at the bottom of `docs/auth.md` in a local checkout, or the summary:

1. Pick the auth flow (device code → PKCE loopback → broker-mediated OAuth, in that order of preference).
2. Add the variant to `src-tauri/src/adapters/mod.rs::Platform`.
3. Implement `DeploymentMonitor` under `src-tauri/src/adapters/<provider>/`.
4. Implement the OAuth entry under `src-tauri/src/auth/<provider>.rs`.
5. Register in `strategy::methods_for` and `strategy::start_oauth`.
6. Extend `AdapterRegistry::hydrate` and `token_provider::get_fresh_access_token` if the provider needs refresh-token handling.
7. Frontend: extend `Platform` in `src/lib/accounts.ts`, add brand mark + token link config.
8. Extend the opener capability allowlist in `src-tauri/capabilities/default.json` for any new provider hosts.

## Security

- **Never** commit tokens, `client_secret`s, or the broker signing key.
- Don't reintroduce `env!()` of a provider `client_secret` in the Rust build — the broker exists to avoid that.
- Test locally with `pnpm tauri build` and run `strings` on the produced binary to verify no secrets slipped in.
