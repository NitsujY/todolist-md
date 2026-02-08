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
- upload: `gog drive upload <filePath> --parent=<folderId>`
- run gog as `ubuntu` and download to `/tmp` (because `/root` is typically `700`)

Included helper script:
- `skills/todolist-md-clawdbot/scripts/todolist_review_drive.py`
  - Lists Drive folder, detects changed files, maintains state.
  - New features:
    - Optional `--write-last-review` flag ensures file headers are up-to-date.
    - Tracks prior state in JSON to skip unmodified files.
    - Uses sha256 hashes to avoid redundant writes.