# Contributing to Bay

Thanks for helping improve **Bay** — a local-first, terminal AI garage agent.

## Development

Requirements: Node.js 20+, pnpm.

```bash
pnpm install
pnpm test:smoke
pnpm run quality
pnpm typecheck
pnpm build
pnpm dev
```

`pnpm install` runs `prepare` → `build` so `dist/` (and the `bay` bin) stay current.

See [docs/testing.md](./docs/testing.md) for MockLLM, fixtures, and harness usage.  
Launch checklist: [docs/launch.md](./docs/launch.md) · Positioning: [docs/messaging.md](./docs/messaging.md)

## Guidelines

- Keep the product **local-first and private** — no cloud taste storage or accounts.
- Prefer small, focused PRs that do not break existing phases.
- Use TypeScript strict mode and Zod for new data shapes.
- Do not add payments, web UI, remote plugin marketplaces, or unfinished experimental UX in default `/help`.
- Never commit API keys, `.env` files, or personal `~/.bay` data.
- Update README / `docs/` / `/help` when user-facing behavior changes.
- Add a CHANGELOG entry for user-visible changes.
- Tests must stay offline (use `MockLLMProvider` / mock OBD).

## Safety

Diagnostic and repair guidance must remain **suggestions**, not certainty. High-risk topics (brakes, steering, airbags, EV high-voltage, etc.) should recommend professional inspection. See [docs/safety.md](./docs/safety.md).

## Pull requests

1. Describe the change and why.
2. Note how you tested (`pnpm test:smoke` / `pnpm run quality`, manual CLI checks).
3. Link related issues.
4. Use the PR template checklist.

## Reporting bugs

Use GitHub Issues (bug report template). Include OS, Node version, `bay version`, provider, and redacted output from `bay doctor` when relevant.

## Releasing

Maintainers: see [docs/releasing.md](./docs/releasing.md).
