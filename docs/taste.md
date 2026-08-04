# Taste, skills & memory

## Taste

Bay learns **how you like vehicle work done** from:

1. **Accept** — Enter after an answer, or `/accept`
2. **Reject** — `/reject [reason]`
3. **Edit** — `/edit` (opens `$EDITOR` / `EDITOR`)

Signals are stored under `~/.bay/taste/` (or your active data root). The living summary is `taste.md` (`/taste edit`).

Taste influences DIY vs shop bias, OEM vs budget parts, risk tone, and schedule recommendations.

## Skills

Skills are reusable rule packs (learned or user-created):

```text
/skill list
/skill create
/skill enable|disable <name>
```

Relevant skills are injected into prompts when they match the current question.

## Long-term memory

Cross-session facts (distinct from chat history):

```text
/memory add Prefer Motul 5W-30
/memory pin <id>
/memory prune
```

Pinned facts survive prune and rank higher in context.

## Knowledge

Add your own manuals/notes (stay local):

```text
/knowledge add ./manual-notes.md
/knowledge search torque lug
```

Citations are labeled as **USER DOCUMENT** so they are not confused with general knowledge.
