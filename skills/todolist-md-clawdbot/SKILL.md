---
name: todolist-md-clawdbot
description: Operate on todolist-md Markdown todo files. Read + summarize tasks, propose edits, and write outcomes back into Markdown using only <!-- bot: ... --> markers (line-stable write-back).
---

# todolist-md-clawdbot

Operate on **todolist-md**: a Markdown-first todo viewer/editor. The app does not contain an AI; the bot reads/writes Markdown.

## Operating rules (must follow)

1) Markdown is the system of record.
- It’s fine to discuss in chat, but final answers/decisions must be written into Markdown.

2) Use only bot markers of this form.
- `<!-- bot: ... -->`
- Do not introduce other syntaxes (no `Question[id=...]`, no custom metadata blocks).

3) Keep write-back edits line-stable.
- todolist-md derives task IDs from Markdown line positions.
- Avoid adding/removing lines inside an existing task item or its description blockquote.
- Prefer single-line, in-place edits (edit text on an existing line).

4) Never complete tasks without explicit user confirmation.

## Markdown conventions (what todolist-md expects)

- Tasks use GFM checkboxes: `- [ ]` and `- [x]`
- Optional tags: `#tag`
- Optional due date: `due:YYYY-MM-DD`
- Optional description: a blockquote directly under the task

Example:
```md
- [ ] Update README for bot workflow #docs due:2026-02-05
  > Include quick start and a worked example
```

## Bot markers (allowed)

- `<!-- bot: suggested -->` for bot-suggested sections
- `<!-- bot: question -->` for in-file Q/A
- `<!-- bot: digest -->` for summaries/digests
- `<!-- bot: note -->` for short audit notes (optional)

## Write-back patterns

### Bot-suggested tasks

Put bot-generated tasks under a dedicated section so humans can review before adopting.

```md
## Tasks (bot-suggested)

<!-- bot: suggested -->
- [ ] (suggested) Add a “Bot Log” section
```

### In-file Q/A (canonical, line-stable)

Ask a question by adding (or reusing) a single comment line under the task:

```md
- [ ] Deploy v2.0 to production #backend
  > <!-- bot: question --> Question: Which CI job is failing? Options: unit / integration / e2e
```

Answer by editing that same line to include `Answer:` (no new lines):

```md
- [ ] Deploy v2.0 to production #backend
  > <!-- bot: question --> Question: Which CI job is failing? Options: unit / integration / e2e Answer: integration
```

Rules:
- Prefer one active Q/A per task at a time.
- Do not start multi-line threads inside the task block.

### Archive Q/A to Bot Log (preferred once answered)

If you want to keep tasks clean while preserving history:

1) Append an entry to `## Bot Log`.
2) Replace the original Q/A line in-place with a short placeholder:

```md
  > <!-- bot: question --> (archived to Bot Log)
```

## Bot Log (append-only)

Create (if missing):
```md
## Bot Log
```

Append entries like:
```md
- 2026-02-01 Task: Deploy v2.0 to production
  Q: Which CI job is failing?
  A: integration
```

## Summaries

- Summarize in chat for fast feedback.
- Optionally write a digest into Markdown as a single comment line:

```md
<!-- bot: digest --> Top 3 next actions: 1) … 2) … 3) …
```

## References

- Full worked example: [../../texture/bot-full-example.md](../../texture/bot-full-example.md)
- Integration notes/spec: [../../specs/integrations/clawdbot.md](../../specs/integrations/clawdbot.md)
