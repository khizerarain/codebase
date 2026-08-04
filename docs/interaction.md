# Fast interaction, garage mode & input providers

Phase 12 makes Codebase faster in real garage use: short aliases, garage mode, rapid workflows, and a pluggable input layer (voice-ready, local-first).

## Garage mode

Hands-busy style: shorter answers, checklists, stronger next actions. Safety language stays intact.

```text
/mode garage
/mode normal
/mode show
```

Or start a session already in garage mode:

```bash
codebase chat --garage
```

Persist the default:

```text
/config set interaction.mode garage
/config set interaction.verbosity short
```

## Speed aliases

Aliases expand before the command router. Toggle with:

```text
/config set interaction.aliases true
/aliases
```

Common shortcuts:

| Alias | Expands to |
|-------|------------|
| `/d …` | `/diagnose …` |
| `/g` | `/garage` |
| `/du` | `/due` |
| `/a` / `/attn` | `/attention` |
| `/snap` | `/obd snapshot` |
| `/dtc` | `/obd dtc` |
| `/br` | `/watchdogs briefing` |
| `/mg` / `/mn` | `/mode garage` / `/mode normal` |
| `/q` | `/quick` |

Tab completion covers slash commands and aliases in the terminal provider.

## Rapid entry points

```text
/quick          # muscle-memory menu
/pretrip        # due + walk-around checklist
/interpret      # OBD snapshot + DTC (+ related alerts)
/lv             # switch to last vehicle
/snap           # quick OBD snapshot (after /obd connect)
```

Typical garage flow:

```text
/mg
/attn
/d squeal when braking cold
done
/log "Pads inspected — ok" 92100
/snap
```

## Last vehicle

Switching with `/vehicles switch <id>` remembers the previous active vehicle. `/lv` toggles back.

## Input providers

```ts
interface InputProvider {
  getInput(prompt?: string): Promise<string>;
}
```

| Provider | When |
|----------|------|
| `TerminalInputProvider` | Interactive TTY (default) |
| `PipedInputProvider` | stdin not a TTY / pipes |
| `VoiceInputProvider` | Skeleton only — no cloud STT |

Config:

```text
/config set interaction.input auto|terminal|piped|voice
/config set interaction.voiceEnabled true
/config set interaction.voiceEngine none|local
```

Voice remains optional. If voice is selected but unavailable, the session tells you how to fall back to terminal input. No cloud speech API is required or bundled.

## Related config

| Key | Values |
|-----|--------|
| `interaction.mode` | `normal` \| `garage` |
| `interaction.verbosity` | `short` \| `normal` \| `detailed` |
| `interaction.aliases` | `true` \| `false` |
| `interaction.input` | `auto` \| `terminal` \| `piped` \| `voice` |
| `interaction.voiceEnabled` | `true` \| `false` |

Session briefings still respect automation settings (`automation.briefingOnStart`, etc.).
