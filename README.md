# Codebase

**Terminal-first AI vehicle agent** that continuously learns your personal vehicle taste — how *you* maintain, diagnose, modify, and care for cars, trucks, EVs, and fleets.

Phase 3: strong agentic core + real vehicle intelligence (planning, tools, rich profiles, professional outputs).

## Features

- Interactive CLI chat (`codebase` / `cb`)
- **Plan → Review → Execute** loop with saved Markdown plans
- Taste engine + skills injected on every request
- Rich multi-vehicle profiles (mileage, fuel type, mods, issues, service history)
- Professional outputs: schedules, diagnostics, parts comparisons, checklists, cost ranges
- Expanded local tools (vehicle CRUD, recalls/TSB search, maintenance schedules, …)
- OpenRouter + Ollama providers
- Fully local-first under `~/.codebase/`

## Install

```bash
pnpm install
pnpm build
pnpm link --global
```

On Windows, if `pnpm link --global` fails PATH checks:

```bash
npm link
```

## Configure

```bash
set OPENROUTER_API_KEY=sk-or-...
set CODEBASE_PROVIDER=openrouter

# or
set CODEBASE_PROVIDER=ollama
set OLLAMA_MODEL=llama3.2
```

## Usage

```bash
codebase
codebase chat --provider ollama
```

### Planning

Non-trivial requests auto-enter planning mode. You can also force it:

```text
/plan DIY brake pad job with cost estimate
/approve
/revise use OEM pads only
```

Plans are saved under `~/.codebase/plans/` as JSON + Markdown.

### Vehicles

```text
/vehicles add 2018 Toyota Tacoma 92000 gas
/vehicles switch <id>
/vehicles edit mileage 93500
/vehicles edit mod bilstein 5100
/vehicles edit issue tip-in clunk
/active
/history
```

### Domain modes

| Command | Action |
|---------|--------|
| `/schedule` | Maintenance schedule for active vehicle |
| `/diagnose squeal on braking` | Structured diagnostic plan/reasoning |
| `/parts front brake pads` | Parts research / OEM vs aftermarket |
| `/export brakes.md` | Export last plan/output |

### Taste (Phase 2 still fully active)

| Command | Action |
|---------|--------|
| `/accept` `/reject` `/edit` | Capture taste signals + learn |
| `/taste` `/taste edit` | View / edit living taste |
| `/skills` `/forget` `/learn` | Manage skills & re-analyze |

### Session

`/help` · `/clear` · `/exit`

## How taste still applies

Every answer and plan injects:
1. Compact personal + vehicle-specific preferences
2. Only the most relevant skills for the current query
3. Active vehicle context

Tools like `compare_parts` and `generate_maintenance_schedule` also bias toward your learned DIY/OEM/budget/performance preferences.

## Safety

Codebase labels diagnostic conclusions as **suggestions**, not certainty, and appends safety notes on critical topics (brakes, steering, HV/EV, etc.). Always verify torque specs and procedures with OEM service information.

## Data layout

```
~/.codebase/
├── config.json
├── taste/
│   ├── taste.md
│   ├── profile.json
│   ├── signals/
│   └── skills/
├── vehicles/
│   ├── _active.json
│   └── <id>.json
├── plans/
├── exports/
├── memory/
└── sessions/
```

## Tools

`search_web` · `read_file` · `write_file` · `list_dir` · `calculate` · `get_vehicle` · `update_vehicle` · `create_checklist` · `estimate_cost` · `search_recalls_tsb` · `generate_maintenance_schedule` · `compare_parts` · `diagnose_symptoms`

## Develop

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Roadmap

- **Phase 1** — Core agent + taste capture ✅
- **Phase 2** — Full taste learning engine ✅
- **Phase 3** — Strong agentic core + vehicle intelligence ✅
- **Phase 4** — Planning polish + deeper safety layer
- **Phase 5** — Multi-vehicle polish, skills export, UX finish

## License

MIT
