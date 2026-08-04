# Testing strategy

Bay uses **Vitest** for unit, integration, and workflow tests. Suites must stay **offline** — no OpenRouter, Ollama, or cloud speech.

## Commands

```bash
pnpm test          # full suite
pnpm test:smoke    # fast critical subset
pnpm test:watch    # interactive
pnpm typecheck     # tsc --noEmit
pnpm run quality   # typecheck + full tests (quality gate)
```

GitHub Actions runs `pnpm run quality` on push/PR to `main` (see `.github/workflows/ci.yml`).  
Note: use `pnpm run quality` — bare `pnpm ci` is pnpm’s clean-install command, not this script.

## Layout

| Path | Role |
|------|------|
| `tests/*.test.ts` | Specs (phase-tagged where useful) |
| `tests/helpers/harness.ts` | Temp data root + MockLLM agent |
| `tests/helpers/fixtures.ts` | Sample vehicles, service history, taste signals |
| `src/testing/mock-llm.ts` | Deterministic `MockLLMProvider` |
| `src/obd/mock.ts` | Mock OBD / vehicle data provider |

## Principles

1. **Temp dirs** — each harness uses `mkdtemp` under the OS temp folder; never write to `~/.bay` in tests.
2. **Mock LLM** — inject `MockLLMProvider` into `Agent` / `TasteManager`. Script text, tool calls, or plan JSON.
3. **Mock OBD** — use `ObdManager.connect("mock", { scenario })` or `MockVehicleDataProvider` directly.
4. **High-value coverage** — taste, plans, diagnostics, OBD, watchdogs, reports, exports, doctor, garage mode. Not 100% line coverage.
5. **Avoid brittle snapshots** — assert structure, safety language, and key codes/paths.

## Example: scripted agent turn

```ts
import { createTestHarness, useTempCleanup } from "./helpers/harness.js";

useTempCleanup();
const h = createTestHarness({ withTacoma: true });
h.llm.enqueueToolCall("calculate", { expression: "2+2" });
h.llm.enqueueText("Result is 4. Suggestion only.");
const result = await h.agent.answer("What is 2+2?");
```

## Smoke vs full

- **Smoke** — version, aliases, safety, MockLLM/OBD connect, harness boot.
- **Full** — includes multi-step diagnosis, watchdogs, ownership reports, doctor integrity, Phase 1–12 regressions.

## Adding tests

Prefer extending `createTestHarness()` over copying temp-dir boilerplate. Put reusable doubles in `src/testing/`. Name new files `tests/<area>.test.ts` or `tests/phaseN-*.test.ts`.
