# Codebase

**Terminal-first AI vehicle agent** that continuously learns your personal vehicle taste — how *you* maintain, diagnose, modify, and care for cars, trucks, EVs, and fleets.

Phase 2: full taste learning engine (signals → preferences → skills → prompt injection).

## Features

- Interactive CLI chat (`codebase` / `cb`)
- Accept / Reject / Edit taste signals
- **Taste Engine** that analyzes signals and updates a living `taste.md`
- **Skills** promoted from repeated / high-confidence preferences
- Compact taste + relevant skills injected into every agent prompt
- Basic vehicle profiles (add / list)
- LLM providers: **OpenRouter** (default) and **Ollama** (local)
- Tools: `search_web`, `read_file`, `list_dir`, `calculate`
- Local-first data under `~/.codebase/` (or project `.codebase/`)

## How taste works

1. You Accept / Reject / Edit an answer (or continue chatting = implicit accept).
2. Codebase saves a raw signal under `taste/signals/`.
3. The Taste Engine runs a local pattern analysis (optional LLM enrichment when configured).
4. It updates structured preferences in `taste/profile.json` and rewrites `taste/taste.md`.
5. Repeated high-confidence patterns become Markdown **skills** in `taste/skills/`.
6. On the next question, the agent injects a **compact taste summary** + only the **most relevant skills** (not the full history).

Learning rules:
- Repeated signals outweigh one-offs
- Personal vs vehicle-specific preferences are tracked separately
- Preferences are never invented — only derived from your signals
- Everything stays local and human-editable

## Requirements

- Node.js 20+
- [pnpm](https://pnpm.io/)
- Either:
  - an [OpenRouter](https://openrouter.ai) API key, or
  - [Ollama](https://ollama.com) running locally

## Install

```bash
pnpm install
pnpm build
pnpm link --global
```

On Windows, if `pnpm link --global` says the global bin directory is not in PATH, use:

```bash
npm link
```

Or run without linking:

```bash
pnpm dev
# or
pnpm chat
```

## Configure

Copy `.env.example` values into your shell / environment:

```bash
# OpenRouter (default)
set OPENROUTER_API_KEY=sk-or-...
set CODEBASE_PROVIDER=openrouter
set OPENROUTER_MODEL=openrouter/free

# or Ollama
set CODEBASE_PROVIDER=ollama
set OLLAMA_MODEL=llama3.2
```

Optional: set `CODEBASE_HOME` to override the data directory.

## Usage

```bash
codebase
# or
codebase chat
cb --help
codebase skills
codebase learn
```

### Session commands

| Command | Action |
|---------|--------|
| *(question)* | Ask the agent |
| `Enter` or `/accept [reason]` | Mark last answer good + learn |
| `/reject [reason]` | Mark last answer bad + learn |
| `/edit` | Edit last answer in `$EDITOR` / Notepad + learn |
| `/vehicles` | List vehicles |
| `/vehicles add <year> <make> <model> [mileage]` | Add a vehicle |
| `/taste` | Show taste summary + top skills |
| `/taste edit` | Open `taste.md` in `$EDITOR` |
| `/skills` | List learned skills |
| `/skills <name>` | Show a specific skill |
| `/forget <preference>` | Remove a preference or skill |
| `/learn` | Re-analyze all signals |
| `/clear` | Clear session history |
| `/help` | Help |
| `/exit` | Quit |

Continuing with a new question implicitly accepts the previous answer and runs learning.

After learning you will see short terminal lines like:

```text
Learned: preference: Prefer DIY-first guidance...
Learned: skill: diy-first
```

## Data layout

```
~/.codebase/
├── config.json
├── taste/
│   ├── taste.md          # living human-readable taste
│   ├── profile.json      # versioned structured preferences
│   ├── signals/          # accept/reject/edit JSON files
│   └── skills/           # reusable Markdown skills
├── memory/
│   └── notes.json
├── vehicles/
│   └── <id>.json
└── sessions/
    └── <session>.json
```

## Develop

```bash
pnpm typecheck
pnpm test
pnpm build
```

## Roadmap

- **Phase 1** — Core agent skeleton + taste capture ✅
- **Phase 2** — Full taste learning engine ✅
- **Phase 3** — Strong tooling + richer vehicle profiles
- **Phase 4** — Planning mode + safety layer
- **Phase 5** — Polish, multi-vehicle, export

## License

MIT
