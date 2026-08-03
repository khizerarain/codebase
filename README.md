# Codebase

**Terminal-first AI vehicle agent** and personal **garage intelligence system** that learns your vehicle taste — how *you* maintain, diagnose, modify, and care for cars, trucks, EVs, and fleets.

Local-first. Private by default. Skills + knowledge + multi-vehicle + service workflows.

> **Safety:** Decision-support only — not a certified mechanic. Diagnoses are ranked hypotheses, never certainty. See `/safety`.

## Install

```bash
git clone https://github.com/khizerarain/codebase.git
cd codebase
pnpm install
pnpm build
pnpm link --global   # or: npm link
```

Needs Node.js 20+ and either OpenRouter or local Ollama.

```bash
$env:OPENROUTER_API_KEY="sk-or-..."
# or
$env:CODEBASE_PROVIDER="ollama"
codebase
```

## Quick start — real workflows

```text
/vehicles add 2018 Toyota Tacoma 92000 gas

/diagnose squeal when braking in the morning
cold only, pedal feels firm
no warning lights
done

/service front brake pads
/approve

/log "Front pads + hardware" 92100 140 diy
/due
/export diagnosis
```

## Phase 7 — Local data intelligence & performance

Unified local data layer, relevance-scored context, garage-scale attention, and data health tools — still fully offline.

```text
/status                 System health snapshot
/doctor                 Broken refs, orphans, schema issues
/backup                 Timestamped local backup under ~/.codebase/backups
/rebuild                Rebuild knowledge index + prune memory bloat
/attention              What needs work across the garage
/memory pin <id>        Keep high-value facts forever
/config set verbose true   Timing/debug logs
```

Context injection now prioritizes the active vehicle, relevant skills, pinned/important memory, related service history, and local knowledge hits — without dumping everything into every prompt. Taste/knowledge snippets are TTL-cached for snappier turns. Large garages get lean vehicle summaries and smarter default active-vehicle selection.

## Phase 6 — Service intelligence

### Structured diagnosis (`/diagnose`)
1. Enter symptoms  
2. Answer clarifying questions (or type `done`)  
3. Get a ranked differential: probability · severity · cost · DIY difficulty  
4. Clear **Suggestion** vs **Action**, plus safety risk level  
5. Auto-saved under `exports/` · `/export diagnosis`

### Service & repair plans (`/service`, `/prep`)
Full plans include parts (OEM vs aftermarket by taste), tools, procedure outline, time/cost, difficulty, torque notes (from knowledge base when available), and taste reasoning. Ties into Plan → `/approve`.

```text
/service oil change
/prep spark plugs
/inspect pre-purchase
```

### History & predictions (`/log`, `/due`)
```text
/log "Oil + filter" 93000 65 diy
/due
/due garage
/history
```

Due calculations use interval tables **and** your logged service history when descriptions match.

## Earlier capabilities (Phases 1–5)

| Area | Commands |
|------|----------|
| Taste | `/accept` `/reject` `/edit` `/taste` `/learn` `/forget` |
| Skills | `/skill create\|edit\|enable\|disable\|delete` |
| Garage | `/garage` `/vehicles` `/compare` `/insights` |
| Knowledge | `/knowledge add\|search\|list` |
| Memory | `/memory …` |
| Planning | `/plan` `/approve` `/revise` |
| Export | `/export plan\|schedule\|checklist\|diagnosis\|service\|last` |

## Privacy

No accounts, no cloud sync, no telemetry. Data stays in `~/.codebase/` (or `CODEBASE_HOME`).

## Develop

```bash
pnpm test
pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). License: [MIT](./LICENSE).

## Roadmap

- Phases 1–5 ✅ foundation through garage/knowledge  
- Phase 6 ✅ deep diagnostics + service intelligence  
- **Phase 7** ✅ local data layer, smarter context, performance & `/doctor`  
- Later: optional OBD/hardware, richer PDF tooling  
