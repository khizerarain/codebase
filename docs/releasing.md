# Releasing

Codebase uses **semver** and [CHANGELOG.md](../CHANGELOG.md).

## Checklist

1. `pnpm test` and `pnpm typecheck` pass
2. Update `package.json` version
3. Update `CHANGELOG.md` (`## [x.y.z] — YYYY-MM-DD`)
4. Confirm README / docs match CLI help
5. Commit on `main`
6. Tag and push:

```bash
git tag -a v0.9.0 -m "v0.9.0"
git push origin main --tags
```

7. Create a GitHub Release from the tag; paste the changelog section as notes

## Version bumps

| Bump | When |
|------|------|
| patch | Fixes, docs, hardening |
| minor | New commands/features (backward compatible) |
| major | Breaking CLI or data-format changes |

## Do not publish secrets

Never commit `.env`, API keys, or copies of `~/.codebase` user data.
