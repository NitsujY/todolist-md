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

3) Preserve task identity.
- todolist-md derives task IDs from Markdown line positions.
- Some storage backends also have a stable identity key (e.g. Drive `fileId`, local `path`, S3 `bucket+key`).
- Do not “replace” a file in a way that changes its identity key unless the user explicitly accepts it.

4) Keep write-back edits line-stable.
- Avoid adding/removing lines inside an existing task item or its description blockquote.
- Prefer single-line, in-place edits (edit text on an existing line).

5) Last review stamp (Option B: top-of-file header line)
- Goal: a single line near the top recording last bot review time.
- Rule: **never insert a new line** once the header exists. Only update the existing header line.
- If the header does not exist, you may insert it at the very top **only if the user explicitly opted into Option B**.
- Canonical format:
  - `<!-- bot: last_review --> 2026-02-04T15:39Z root=<rootFolderId> model=<model>`

6) Never complete tasks without explicit user confirmation.

## Markdown conventions (what todolist-md expects)

- Tasks use GFM checkboxes: `- [ ]` and `- [x]`
- Optional tags: `#tag`
- Optional due date: `due:YYYY-MM-DD`
- Optional description: a blockquote directly under the task

## Storage Q/A (first run)
Ask once, then persist the answers (in memory/config) for future runs.

- Q: `storageKind`?
  - A: `google-drive` | `local-folder` | `s3` | `other`
- Q: What is the stable identity key for files?
  - Drive: `fileId`
  - Local: `path`
  - S3: `bucket+key`
- Q: Where is the root?
  - Drive: `rootFolderId`
  - Local: root directory path
  - S3: `bucket` + optional prefix

## Review cadence + stamping (save credits)
**Do not call an LLM unless a file changed.** Use code-first change detection.

### Step 0: Detect changes (code-first)
- For each `.md` under root, compare `modifiedTime`/`size` (or `etag` when available) against a local state file.
- If unchanged since last scan: **skip** (no download, no LLM).

### Step 1: Review only changed files
- Only for changed files:
  - Download the file
  - Extract open tasks (`- [ ]`) and relevant context
  - (Optional) call the LLM on the extracted subset, not the full document

### Step 2: Write-back only if content changed
- Before writing back, compute a hash; if no changes, do not write.

### Step 3: Stamp last review (Option B)
- For each reviewed file, update (not append) the top-of-file header line:
  - `<!-- bot: last_review --> <ISO_UTC> root=<rootFolderId> model=<model>`

### Reference script (Google Drive + gog)
If you use **Google Drive** as storage, gog CLI flags matter. In gog v0.9.0+:
- list folder: `gog drive ls --parent <folderId> --json`
- download: `gog drive download <fileId> --out <path>`
- run gog as `ubuntu` and download to `/tmp` (because `/root` is typically `700`)

Included helper script:
- `skills/todolist-md-clawdbot/scripts/todolist_review_drive.py`
  - lists Drive folder, detects changed files, maintains state

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

## Worked example (end-to-end)

Start state:

```md
## Work

- [ ] Deploy v2.0 to production #backend due:2026-02-05
  > Runbook: docs/deploy.md

## Tasks (bot-suggested)
<!-- bot: suggested -->
- [ ] (suggested) Add a “Bot Log” section
```

Bot asks a clarifying question (in-file):

```md
- [ ] Deploy v2.0 to production #backend due:2026-02-05
  > Runbook: docs/deploy.md
  > <!-- bot: question --> Question: Which CI job is failing? Options: unit / integration / e2e
```

User answers by editing the same line (line-stable):

```md
  > <!-- bot: question --> Question: Which CI job is failing? Options: unit / integration / e2e Answer: integration
```

After the bot consumes the answer, archive it (preferred):

```md
  > <!-- bot: question --> (archived to Bot Log)

## Bot Log
- 2026-02-04 Task: Deploy v2.0 to production | Q: Which CI job is failing? | A: integration
```

## Integration notes (minimal)

- Always mark bot-written content with `<!-- bot: ... -->`.
- Never delete/add lines inside an existing task item or description block.
- Never mark tasks complete unless the user explicitly confirms.
