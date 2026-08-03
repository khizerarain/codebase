# Local mods

Mods extend Codebase **on your machine only**. There is no marketplace and **no code execution**.

## Location

`~/.codebase/mods/<mod-id>/mod.json`

## What a mod can contribute

- Extra **skills** (JSON matching the skill schema)
- Slash **commands** that show Markdown/text
- **Report templates** with `{{body}}`, `{{date}}`, `{{vehicle}}`
- Lookup **tools** (Markdown files only)

## Manage

```text
/mods list
/mods show <id>
/mods enable <id>
/mods disable <id>
/mods path
```

An example mod `example-fleet-notes` is seeded **disabled**. Enable it to try `/fleetnotes`.

## Safety expectations

- Mods are declarative JSON/Markdown
- Disable anything you did not write or review
- Never paste secrets into mod files
