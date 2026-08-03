# Contributing to Codebase

Thanks for helping improve Codebase — a local-first, terminal AI vehicle agent.

## Development

Requirements: Node.js 20+, pnpm.

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

`pnpm install` runs `prepare` → `build` so `dist/` (and the `codebase` bin) stay current.

## Guidelines

- Keep the product **local-first and private** — no cloud taste storage or accounts.
- Prefer small, focused PRs that do not break existing phases (1–9).
- Use TypeScript strict mode and Zod for new data shapes.
- Do not add payments, web UI, remote plugin marketplaces, or OBD/hardware unless explicitly scoped.
- Never commit API keys, `.env` files, or personal `~/.codebase` data.
- Update README / `docs/` / `/help` when user-facing behavior changes.
- Add a CHANGELOG entry for user-visible changes.

## Safety

Diagnostic and repair guidance must remain **suggestions**, not certainty. High-risk topics (brakes, steering, airbags, EV high-voltage, etc.) should recommend professional inspection. See [docs/safety.md](./docs/safety.md).

## Pull requests

1. Describe the change and why.
2. Note how you tested (`pnpm test`, manual CLI checks).
3. Link related issues.
4. Use the PR template checklist.

## Reporting bugs

Use GitHub Issues (bug report template). Include OS, Node version, `codebase version`, provider, and redacted output from `codebase doctor` when relevant.

## Releasing

Maintainers: see [docs/releasing.md](./docs/releasing.md).
