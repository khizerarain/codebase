# Releasing

Bay uses **semver** and [CHANGELOG.md](../CHANGELOG.md). See also [launch.md](./launch.md).

## Checklist

1. `pnpm run quality` passes
2. Update `package.json` version + `src/brand.ts` copy if needed
3. Update `CHANGELOG.md` (`## [x.y.z] — YYYY-MM-DD`)
4. Confirm README / docs match CLI help and `/about`
5. Commit on `main`
6. Tag and push:

```bash
git tag -a v0.14.0 -m "v0.14.0 — Bay launch identity"
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

Never commit `.env`, API keys, or copies of `~/.bay` / `~/.codebase` user data.
