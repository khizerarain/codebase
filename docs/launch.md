# Launch readiness

Product name: **Bay** · CLI: `bay` · Version: **0.14.0**

## Demo script (60–90 seconds)

Goal: a stranger sees value without architecture talk.

1. **Install once** (skip if already linked): `pnpm install && pnpm build && pnpm link --global`
2. Set `OPENROUTER_API_KEY` or `BAY_PROVIDER=ollama`
3. Run `bay`
4. In session:

```text
/vehicles add 2016 Honda Civic 118000 gas
/due
/diagnose rough idle and check engine light
done
/obd connect mock fault_catalyst
/obd dtc
/accept
/report ownership
/about
```

Talk track:

- “Bay keeps your garage on your machine.”
- “Accept teaches it your taste.”
- “Mock OBD works with no hardware.”
- “Suggestions only — see `/safety`.”

## Launch checklist

- [x] Product name locked: **Bay** (`src/brand.ts`)
- [x] Binary is `bay` (no `codebase` / `cb` aliases)
- [x] README hero + 30-second value + quick start
- [x] Install path documented for strangers (`docs/install.md`)
- [x] `/help` and `/about` launch-ready
- [x] Safety / privacy near top of README
- [x] LICENSE, CONTRIBUTING, CHANGELOG present
- [x] Issue templates present
- [x] Messaging blocks (`docs/messaging.md`)
- [x] Demo script (this file)
- [ ] Clean-machine smoke (human): clone → link → `bay version` → `bay doctor` → chat
- [ ] `pnpm run quality` green before announce
- [ ] No secrets / `.env` / personal `~/.bay` data in repo
- [ ] Mock OBD: `/obd connect mock` → `/obd dtc`
- [ ] Taste: `/accept` updates taste summary
- [ ] Export / report writes under data root only
- [ ] GitHub description + topics updated

## First external users

Point them to:

1. README quick start  
2. `docs/install.md`  
3. This demo script  
4. `/safety` and `docs/safety.md`

Do **not** lead with Phase history, internal architecture, or voice skeleton details.
