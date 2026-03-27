# Repository Guidelines

## Project Structure & Module Organization
This repository is a single-file Cloudflare Worker application. Core runtime, admin UI, routing logic, KV/D1 access, and scheduled tasks all live in `worker.js`. Deployment settings and bindings live in `wrangler.toml`. CI automation is under `.github/workflows/`, including `deploy-worker.yml` for Cloudflare deployment and `sync_fork.yml` for fork sync. Contributor-facing docs are kept at the repo root, especially `README.md`, `worker-config-form-dictionary.md`, `全局设置功能文档.md`, and `emby-login-security.md`. Static screenshots used in docs live in `img/`.

## Build, Test, and Development Commands
There is no build pipeline or `package.json`; deploys are source-first.

- `npx wrangler dev`: run the Worker locally for manual verification.
- `npx wrangler deploy`: deploy `worker.js` using `wrangler.toml`.
- `npx wrangler tail`: inspect live logs while validating proxy, login, or scheduled flows.
- `git diff -- worker.js wrangler.toml`: review the exact deployment surface before pushing.

Before running Wrangler, replace placeholder KV/D1 IDs in `wrangler.toml` and configure secrets such as `ADMIN_PASS` and `JWT_SECRET` in Cloudflare, not in Git.

## Coding Style & Naming Conventions
Follow the existing style in `worker.js`: 2-space indentation, semicolons, descriptive helper names, and small comment blocks only where structure is non-obvious. Use `camelCase` for functions and local variables, `PascalCase` for structured config/group objects, and clear uppercase names for constant-style groups when already established. Keep new settings aligned with `CONFIG_FORM_BINDINGS` and document binding changes in `worker-config-form-dictionary.md`.

## Testing Guidelines
This repo currently has no automated test suite. Validate changes manually with `wrangler dev` or a test deployment. At minimum, test the affected admin flow under `ADMIN_PATH`, confirm KV/D1 reads and writes, and verify one real proxy path or playback scenario when routing logic changes. For config changes, export a backup first and test one setting group at a time.

## Commit & Pull Request Guidelines
Recent history mixes short Chinese summaries, `Update ...`, and occasional Conventional Commit prefixes such as `feat:`. Prefer concise, imperative subjects with an optional type prefix, for example `feat: refine DNS dual-mode editor` or `fix: prevent node save failure`. Pull requests should describe user-visible impact, list any Cloudflare binding or secret changes, link the related issue when available, and include screenshots for admin UI changes. If the change affects deployment, mention whether `worker.js`, `wrangler.toml`, or workflow files changed.

## Security & Configuration Tips
Never commit real API tokens, Telegram credentials, `ADMIN_PASS`, or `JWT_SECRET`. Redact account-specific IDs in examples, and avoid committing production-only `wrangler.toml` values from personal environments.
