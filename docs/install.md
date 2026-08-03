# Install

## Requirements

- **Node.js 20+** (`node -v`)
- **pnpm** (recommended) or npm
- An LLM backend:
  - **OpenRouter** API key, or
  - **Ollama** running locally

## From source (recommended today)

```bash
git clone https://github.com/khizerarain/codebase.git
cd codebase
pnpm install
pnpm build
pnpm link --global
```

On Windows, if `pnpm link --global` does not put `codebase` on your PATH:

```bash
npm link
```

Then run:

```bash
codebase
# or
cb
```

## Environment

```bash
# OpenRouter (default provider)
export OPENROUTER_API_KEY="sk-or-..."
# optional
export OPENROUTER_MODEL="openrouter/free"

# Or local Ollama
export CODEBASE_PROVIDER="ollama"
export OLLAMA_MODEL="llama3.2"
```

PowerShell:

```powershell
$env:OPENROUTER_API_KEY="sk-or-..."
# or
$env:CODEBASE_PROVIDER="ollama"
codebase
```

## Data directory

User data is **never** stored in the git repo by default:

| Location | When |
|----------|------|
| `~/.codebase/` | Default |
| `$CODEBASE_HOME` | If set |
| `./.codebase/` | If that folder already exists in the current working directory |

## Verify install

```bash
codebase version
codebase doctor
codebase   # starts chat; type /about
```

## Platforms

| Platform | Notes |
|----------|--------|
| macOS | Fully supported |
| Linux | Fully supported |
| Windows | Supported via PowerShell / cmd; use `npm link` if global pnpm shims are missing |

See [troubleshooting.md](./troubleshooting.md) if the binary is not found.
