# Install Bay

One obvious path: **clone → install → link → run**.

## Requirements

- **Node.js 20+** (`node -v`)
- **pnpm** (recommended) or npm
- An LLM backend:
  - **OpenRouter** API key, or
  - **Ollama** running locally

You do **not** need to understand Bay’s internals to try it.

## Install (recommended)

```bash
git clone https://github.com/khizerarain/codebase.git
cd codebase
pnpm install
pnpm build
pnpm link --global
```

On Windows, if `bay` is not found after linking:

```bash
npm link
```

## Run

```bash
# macOS / Linux
export OPENROUTER_API_KEY="sk-or-..."
# or local models:
# export BAY_PROVIDER=ollama

bay
bay version
bay doctor
```

PowerShell:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
# $env:BAY_PROVIDER="ollama"
bay
```

## Environment

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter (default provider) |
| `OPENROUTER_MODEL` | Optional model override |
| `BAY_PROVIDER` | `openrouter` or `ollama` |
| `OLLAMA_MODEL` / `OLLAMA_BASE_URL` | Local Ollama |
| `BAY_HOME` | Override data directory |
| `BAY_VERBOSE` | `1` for timing logs |

Legacy `CODEBASE_*` env vars still work if you used earlier builds.

## Data directory

| Location | When |
|----------|------|
| `~/.bay/` | Default for new installs |
| `$BAY_HOME` | If set |
| `./.bay/` | If present in the current working directory |
| `~/.codebase/` / `CODEBASE_HOME` / `./.codebase/` | Legacy — still used if found |

## Verify

```bash
bay version    # bay 0.14.x
bay doctor     # local data + install readiness
bay            # chat; type /about then /help
```

## Common failures

| Symptom | Fix |
|---------|-----|
| `bay: command not found` | Re-run `pnpm link --global` or `npm link`; ensure npm global bin is on PATH |
| OpenRouter errors | Set `OPENROUTER_API_KEY`; or `BAY_PROVIDER=ollama` |
| Ollama unreachable | Start Ollama; check `OLLAMA_BASE_URL` |
| Empty / odd answers | `/clear`, confirm provider with `/config`, try `/onboarding` |

See [troubleshooting.md](./troubleshooting.md).
