# Codebase

**Terminal-first AI vehicle agent** and personal **garage intelligence system** that learns your vehicle taste — how *you* maintain, diagnose, modify, and care for cars, trucks, EVs, and fleets.

Local-first. Private by default. Skills + knowledge + multi-vehicle aware.

> **Safety:** Decision-support only — not a certified mechanic. See `/safety`.

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

## Quick start

```text
/vehicles add 2018 Toyota Tacoma 92000 gas
/garage
/skill create OEM Safety :: Prefer OEM on brakes/steering :: Use OEM or OE-quality for safety parts :: oem,safety
/knowledge add ./my-manual.md active
/schedule
/insights
```

## What’s new in Phase 5

### Skills you control
- Auto-learned skills still appear from Accept/Reject/Edit
- Create/edit/enable/disable your own Markdown skills
- Vehicle-specific or global; relevant skills inject into every prompt

```text
/skill list
/skill create Winter Prep :: Cold-climate rules :: Use -40 washer fluid | Block heater notes :: climate,winter
/skill edit winter-prep
/skill disable budget-conscious
```

### Garage intelligence
```text
/garage
/garage pref Prefer weekend DIY blocks under 3 hours
/compare <idA> <idB>
/compare approaches brake job
/insights
```

### Local knowledge base
Ingest manuals, notes, or text-based PDFs. The agent searches them via `search_knowledge` and labels hits as **USER DOCUMENT**.

```text
/knowledge add D:\manuals\tacoma-service.md active
/knowledge search valve clearance
/knowledge list
```

### Long-term memory
Durable facts across sessions (personal / vehicle / one-time context):

```text
/memory add personal Prefer Motul 5W-30 in winter
/memory add vehicle Has Bilstein 5100s at stock height
/memory pending
/memory confirm
```

High-impact turns may propose memory facts — confirm or reject explicitly.

## Core loop (still Phase 1–4)

1. Ask or run a command  
2. Non-trivial work → Plan → `/approve`  
3. Accept / Reject / Edit → taste + skills learn  
4. Next session is smarter  

## Command map

| Area | Commands |
|------|----------|
| Taste | `/accept` `/reject` `/edit` `/taste` `/learn` `/forget` |
| Skills | `/skill list\|create\|edit\|enable\|disable\|delete` |
| Garage | `/garage` `/vehicles` `/active` `/compare` `/insights` `/history` |
| Knowledge | `/knowledge add\|list\|search\|remove` |
| Memory | `/memory list\|add\|remove\|pending\|confirm\|reject` |
| Domain | `/schedule` `/diagnose` `/parts` `/plan` `/approve` |
| System | `/export` `/config` `/safety` `/help` |

## Privacy

- No accounts, no cloud sync, no telemetry
- Data under `~/.codebase/` (or `CODEBASE_HOME`)
- LLM calls only to the provider you choose

## Data layout

```
~/.codebase/
├── config.json
├── garage-preferences.json
├── taste/skills/          # learned + user skills
├── knowledge/             # manuals + index
├── memory/longterm.json
├── vehicles/
├── plans/
└── exports/
```

## Develop

```bash
pnpm test
pnpm build
```

See [CONTRIBUTING.md](./CONTRIBUTING.md). License: [MIT](./LICENSE).

## Roadmap

- Phases 1–4 ✅ foundation, taste, agent tools, safety/polish  
- **Phase 5** ✅ skills, garage, knowledge, long-term memory  
- Later: OBD/hardware (optional), deeper PDF tooling, export packs  
