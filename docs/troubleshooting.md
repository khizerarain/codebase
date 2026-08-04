# Troubleshooting

## `bay` not found

1. Confirm build: `pnpm build`
2. Link again: `pnpm link --global` or `npm link`
3. Ensure npm’s global bin directory is on your `PATH`
4. Windows: restart the terminal after linking

If you previously linked the old `codebase` / `cb` binaries, unlink them and link again so only `bay` is installed.

## OpenRouter errors / empty answers

- Set `OPENROUTER_API_KEY`
- Or switch: `bay --provider ollama` / `/config set provider ollama`
- Check `/config` and `/status`

## Ollama connection failed

- Start Ollama locally
- Confirm `OLLAMA_BASE_URL` (default `http://localhost:11434`)
- Pull the model: `ollama pull llama3.2`

## Permission / data directory errors

- Ensure your user can write to `~/.bay` (or legacy `~/.codebase` if still in use)
- Or set `BAY_HOME` to a writable folder
- Run `/doctor` or `bay doctor`

## Session feels slow or huge

- `/clear` to drop chat history (keeps vehicles/taste/memory)
- `/memory prune` for long-term fact bloat
- Large garages: use `/due garage`, `/attention`, `/ownership garage`

## Interrupted mid-answer

- Ctrl+C saves the session when possible
- Restart and continue; use `/clear` if recovery is noisy
- `recoverLastSession` can be turned off: `/config set recoverLastSession false`

## Mods not showing

- `/mods path` — confirm folder
- `/mods list` — enable the mod
- Invalid `mod.json` appears as disabled/invalid

## Still stuck

```bash
bay doctor
bay version
```

Open a GitHub issue with OS, Node version, provider, and the command that failed (redact keys).
