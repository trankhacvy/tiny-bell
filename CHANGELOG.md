# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] — 2026-04-21

### Changed
- Notifications now show the commit message and `branch · author` context
  instead of just the project name. Title format: `project · Deployment ready/failed/...`.
- The "Deployment ready" notification after a failed build is now labelled
  `Deployment recovered` to reflect what's actually happening.
- Test notification body previews the real format so users see what their
  deploy notifications will look like.

## [0.1.0] — 2026-04-21

Initial public release. macOS (Apple Silicon + Intel), unsigned builds.

### Added
- Menubar app for monitoring Vercel, Railway, and GitHub Actions deployments.
- Adapter architecture over three provider APIs (REST + GraphQL).
- OAuth flows per provider:
  - **Vercel** — broker-mediated via stateless Cloudflare Worker (`./broker/`).
  - **Railway** — PKCE public client (no `client_secret` in binary).
  - **GitHub** — Device Flow.
- PAT (paste-token) fallback for all providers.
- OS keychain for all token storage (unified vault).
- System tray with health-colored icons, global shortcut (default `⌥⌘D`), popover feed with keyboard navigation.
- Real-time polling with per-account health tracking and native notifications on state transitions.
- GitHub ETag cache to minimize rate-limit pressure.

[Unreleased]: https://github.com/trankhacvy/tiny-bell/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/trankhacvy/tiny-bell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/trankhacvy/tiny-bell/releases/tag/v0.1.0
