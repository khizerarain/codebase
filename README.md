# Codebase

**Terminal-first AI vehicle agent** and personal **garage intelligence system**.  
It learns your vehicle *taste* — how you maintain, diagnose, modify, and care for cars, trucks, EVs, and small fleets — and keeps everything **on your machine**.

Local-first. Private by default. No accounts. No cloud sync. No web dashboard.

> **Safety:** Decision-support only — not a certified mechanic. Diagnoses are ranked hypotheses, never certainty. See [`docs/safety.md`](./docs/safety.md) or `/safety` in the CLI.

## Who it is for

- DIY owners who want structured plans and checklists
- Multi-vehicle households that need garage-wide “what’s due?”
- Anyone who wants ownership cost/health insights without uploading data

## Quick start

**Requirements:** Node.js 20+, pnpm (or npm), plus OpenRouter **or** local Ollama.

```bash
git clone https://github.com/khizerarain/codebase.git
cd codebase
pnpm install
pnpm build
pnpm link --global   # Windows fallback: npm link
```

```bash
# macOS / Linux
export OPENROUTER_API_KEY="sk-or-..."
# or: export CODEBASE_PROVIDER=ollama

# Windows PowerShell
$env:OPENROUTER_API_KEY="sk-or-..."
```

```bash
codebase          # or: cb
codebase version
codebase doctor
```

Full install notes: [`docs/install.md`](./docs/install.md) · Troubleshooting: [`docs/troubleshooting.md`](./docs/troubleshooting.md)

## Core concepts

| Concept | What it means |
|---------|----------------|
| **Taste** | Preferences learned from Accept / Reject / Edit |
| **Skills** | Reusable rule packs injected when relevant |
| **Garage** | Multi-vehicle profiles + active vehicle context |
| **Knowledge** | Your local manuals/notes (keyword search) |
| **Memory** | Durable facts you pin across sessions |
| **Safety** | Suggestion vs Action; high-risk systems → pro |

Details: [`docs/taste.md`](./docs/taste.md) · [`docs/safety.md`](./docs/safety.md)

## Real workflows

```text
/vehicles add 2018 Toyota Tacoma 92000 gas

/diagnose squeal when braking in the morning
cold only, pedal feels firm
done

/service front brake pads
/approve

/log "Front pads + hardware" 92100 140 diy
/due
/ownership
/report ownership
```

### Live OBD (mock — no hardware required)

```text
/obd connect mock fault_catalyst
/obd status
/obd dtc
/obd snapshot
/obd monitor 8
/diagnose rough idle and check engine light
done
/obd disconnect
```

Architecture, serial skeleton, and how to add a real ELM327 transport: [`docs/obd.md`](./docs/obd.md)

### Proactive watchdogs (local, user-controlled)

```text
/watchdogs list
/watchdogs run
/watchdogs briefing
/watchdogs dismiss <id>
/config set automation.assertiveness quiet
```

Quiet by default. Optional garage briefing on session start. No daemon, no cloud push. Details: [`docs/automation.md`](./docs/automation.md)

### Fast interaction & garage mode

```text
/mode garage          # shorter checklists, stronger next actions
/quick                # rapid action menu
/d brake squeal cold  # alias → /diagnose …
/attn                 # what needs attention
/snap                 # OBD snapshot (after /obd connect mock)
/lv                   # switch back to last vehicle
/pretrip              # due + walk-around checklist
```

```bash
codebase chat --garage
```

```text
/config set interaction.mode garage
/config set interaction.verbosity short
/aliases
```

Voice is optional and local-first (pluggable `InputProvider` — no cloud speech API). Details: [`docs/interaction.md`](./docs/interaction.md)

Pre-purchase style support:

```text
/inspect pre-purchase
/report prepurchase
/decide keep
```

## Command map (short)

| Area | Commands |
|------|----------|
| Taste | `/accept` `/reject` `/edit` `/taste` `/learn` `/skill` |
| Garage | `/vehicles` `/garage` `/compare` `/insights` `/due` |
| Service | `/diagnose` `/service` `/prep` `/log` `/schedule` `/parts` |
| Live OBD | `/obd connect\|status\|snapshot\|dtc\|monitor\|disconnect` |
| Automation | `/watchdogs list\|run\|enable\|disable\|dismiss` |
| Speed | `/mode` `/quick` `/aliases` `/pretrip` `/lv` `/interpret` |
| Ownership | `/ownership` `/health` `/report` `/decide` |
| Extensibility | `/mods` `/knowledge` `/memory` |
| System | `/help` `/version` `/about` `/status` `/doctor` `/config` `/safety` |

Full list: [`docs/commands.md`](./docs/commands.md) · in-session: `/help`

## Privacy

- No accounts, payments, telemetry, or cloud taste storage
- Data defaults to `~/.codebase/` (override with `CODEBASE_HOME`)
- Local mods are declarative JSON/Markdown only — [docs/mods.md](./docs/mods.md)

## Develop

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm dev
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) · [CHANGELOG.md](./CHANGELOG.md) · [docs/releasing.md](./docs/releasing.md)  
License: [MIT](./LICENSE)

## Version

Current: **0.12.0** (Phase 12 — garage mode, aliases, voice-ready input)

```bash
codebase version
```
