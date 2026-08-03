# Contributing to Codebase

Thanks for helping improve Codebase — a local-first, terminal AI vehicle agent.

## Development

Requirements: Node.js 20+, pnpm.

```bash
pnpm install
pnpm test
pnpm build
pnpm dev
```

## Guidelines

- Keep the product **local-first and private** — no cloud taste storage or accounts.
- Prefer small, focused PRs that do not break Phases 1–4 behavior.
- Use TypeScript strict mode and Zod for new data shapes.
- Do not add payments, web UI, or OBD/hardware integrations unless that work is explicitly scoped.
- Never commit API keys, `.env` files, or personal `~/.codebase` data.

## Safety

Diagnostic and repair guidance must remain **suggestions**, not certainty. High-risk topics (brakes, steering, airbags, EV high-voltage, etc.) should recommend professional inspection.

## Pull requests

1. Describe the change and why.
2. Note how you tested (`pnpm test`, manual CLI checks).
3. Update the README if user-facing behavior changes.

## Questions

Open a GitHub issue with reproduction steps when reporting bugs.
