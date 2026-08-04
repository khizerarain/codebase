# Bay

**Local-first AI garage agent that learns how you take care of your vehicles.**

Bay runs in your terminal. It helps you diagnose issues, plan service, track what’s due across a garage, and remember *your* taste — DIY vs shop, OEM vs aftermarket, budget, risk — without uploading your data.

**Local-first · Private by default · No accounts · No cloud sync · No web dashboard**

> **Safety:** Decision-support only — not a certified mechanic. Diagnoses are ranked hypotheses, never certainty. High-risk systems (brakes, steering, airbags, EV high-voltage) warrant professional inspection. See [`docs/safety.md`](./docs/safety.md) or `/safety`.

---

## Why Bay is different

- **Taste learning** — Accept / Reject / Edit teaches Bay how *you* work on cars
- **Real garage workflows** — diagnose, service plans, due items, ownership health, mock OBD
- **Stays on your machine** — vehicles, history, taste, and reports live under `~/.bay`

## Quick start (under 10 lines)

**Need:** Node.js 20+, pnpm, and either an [OpenRouter](https://openrouter.ai) key **or** [Ollama](https://ollama.com) locally.

```bash
git clone https://github.com/khizerarain/codebase.git
cd codebase
pnpm install && pnpm build && pnpm link --global
```

```bash
export OPENROUTER_API_KEY="sk-or-..."   # or: export BAY_PROVIDER=ollama
bay
```

```text
/vehicles add 2018 Toyota Tacoma 92000 gas
/diagnose squeal when braking cold
/obd connect mock
/help
```

Windows: if `bay` is not on PATH after `pnpm link --global`, run `npm link` instead.  
Full install: [`docs/install.md`](./docs/install.md) · Troubleshooting: [`docs/troubleshooting.md`](./docs/troubleshooting.md)

## 60-second demo

```text
bay
/vehicles add 2016 Honda Civic 118000 gas
/due
/diagnose rough idle check engine light
done
/obd connect mock fault_catalyst
/obd dtc
/accept
/report ownership
/about
```

Longer script: [`docs/launch.md`](./docs/launch.md)

## Terminal example

```text
  Bay — Local-first AI garage agent that learns how you take care of your vehicles.
  Taste-aware · local-first · private · /help · /about · /quick

you › /vehicles add 2018 Toyota Tacoma 92000 gas
✔ Added & activated 2018 Toyota Tacoma

you › /d brake squeal cold mornings
Bay ›
## Clarifying questions
…

you › done
Bay ›
## Possible causes
1. Glazed / cold pad material …
Suggestion: …
Action: …
Safety note: …
```

## Core concepts

| Concept | What it means |
|---------|----------------|
| **Taste** | Preferences learned from Accept / Reject / Edit |
| **Skills** | Reusable rule packs injected when relevant |
| **Garage** | Multi-vehicle profiles + active vehicle |
| **Safety** | Suggestion vs Action; high-risk → pro |

## Command map

| Start here | Commands |
|------------|----------|
| Garage | `/vehicles` `/garage` `/due` `/attention` `/health` |
| Service | `/diagnose` `/service` `/prep` `/log` |
| Taste | `/accept` `/reject` `/edit` `/taste` |
| OBD | `/obd connect mock` `/obd dtc` `/snap` |
| Reports | `/ownership` `/report ownership` |
| Speed | `/quick` `/mode garage` `/aliases` |

Full list: [`docs/commands.md`](./docs/commands.md) · in-session: `/help`

## Privacy

- No accounts, payments, telemetry, or cloud taste storage
- Data defaults to `~/.bay/` (override with `BAY_HOME`)
- Legacy `~/.codebase` / `CODEBASE_HOME` still honored if present

## Develop

```bash
pnpm test:smoke
pnpm run quality
pnpm build
pnpm dev
```

See [`docs/testing.md`](./docs/testing.md) · [CONTRIBUTING.md](./CONTRIBUTING.md) · [CHANGELOG.md](./CHANGELOG.md) · [`docs/launch.md`](./docs/launch.md)

**License:** [MIT](./LICENSE) · **Version:** 0.14.0
