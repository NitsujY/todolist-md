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

## Chrome app integration: enable/disable per-file
When a Drive folder contains many `.md` files, not all of them should necessarily be AI-reviewed.

**Recommendation (simple + app-controlled):**
- The Chrome app should write a small per-file config key/marker so the agent can know whether a file is opted-in.

Two easy options:

### Option 1: a dedicated Drive config file (preferred)
Create a config file in the same folder:
- `.todolist-md.config.json`

Example:
```json
{
  "ai": {
    "enabled": true,
    "include": ["*.md"],
    "exclude": ["todoapp.md"]
  }
}
```

The agent should:
- Download `.todolist-md.config.json` when it changes.
- Only review files that match include/exclude rules.

### Option 2: an in-file marker (works without JSON)
Add a single line near the top of the markdown file:
- `<!-- bot: ai_enabled --> true`

The agent should only review files containing that marker.

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

### Reference script (two-stage runner)
Canonical runner:
- `scripts/todolist_skill_runner.mjs`

Runner scope:
- Uses exactly 2 stages: `plan` and `write`
- Default workflow is fixture-first local testing before any production rollout
- Write behavior is inline under task descriptions (no dedicated bot section creation)

Current command presets:
- `npm run skill:plan:fixture`
- `npm run skill:write:fixture`

### Standalone skill folder usage

If a user downloads only `skills/todolist-md-clawdbot`, keep a local `package.json` in that folder.

Why:
- it declares required dependencies for scripts (for example, `googleapis` for Drive sync),
- it exposes simple local commands without requiring the root app package.

Example (inside `skills/todolist-md-clawdbot`):

```bash
npm install
FOLDER_NAME="todolist-md"
npm run drive:md:download -- --folderName "$FOLDER_NAME" --outDir ./outputs/drive-md
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json
```

### Google Drive runtime contract (agent MUST follow)

When `storageKind=google-drive`, the skill agent must use `scripts/drive_markdown_sync.mjs` for file transport:

1) **Download phase (before analysis / plan):**
- Run:
  - `npm run drive:md:download -- --folderName "$FOLDER_NAME" --outDir ./outputs/drive-md`
  - or `--folderId <id>` if folder name lookup is ambiguous.
- Output files:
  - Local markdown copies in `./outputs/drive-md`
  - Manifest file `./outputs/drive-md/.drive-md-map.json`

2) **Local processing phase (plan/write):**
- Read and edit only local markdown files in `./outputs/drive-md`.
- Keep bot edits inline and line-stable per this skill spec.

3) **Upload phase (after approved write):**
- Run:
  - `npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json`
- This uploads by Drive `fileId` (stable identity), not by filename only.

4) **Optional safety checks:**
- Dry-run before real upload:
  - `npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --dryRun`
- Recreate missing remote files when explicitly desired:
  - `npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --createMissing`

#### What is `.drive-md-map.json`?

`.drive-md-map.json` is generated by the **download** command.

It is a manifest that maps each local markdown file to its Drive metadata, including:
- `fileId` (authoritative remote identity)
- `fileName`
- `localPath`
- `modifiedTime`

The upload step relies on this manifest to update the correct Drive file IDs and avoid wrong-file updates.

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

## LLM handoff (plan/write) — minimum-token workflow

When you want LLM help but must keep Drive as the source of truth (and keep costs low), use the **two-stage** flow:

### Stage 1: plan
Goal: generate a compact JSON request for the OpenClaw agent runtime (LLM), without calling any LLM from the Node script.

What happens:
1) List folder files (cheap; no downloads)
2) Compare each file's `modifiedTime/size` against a local state file
3) Download only changed `.md`
4) Extract only open tasks (`- [ ] ...`, max N lines)
5) Write `llm_request.json`

Command example:
```bash
node scripts/todolist_skill_runner.mjs plan \
  --source fixture \
  --fixture fixtures/todolist-md/input \
  --state outputs/todolist-md/folder_state.json \
  --requestOut outputs/todolist-md/llm_request.json
```

### Stage 2: write
Goal: take a suggestions JSON (produced by the agent runtime) and write it back **inline** under the matched task.

Rules:
- Update inline under matched task descriptions with bot markers.
- Never mark tasks complete.
- Skip duplicate insertion when the same marker line already exists near the task.

Suggestions JSON shape:
```json
{
  "schema": "todolist-md.llm_suggestions.v1",
  "items": [
    {
      "fileId": "...",
      "name": "vyond.md",
      "target_task": "Deploy v2.0 to production",
      "suggested_markdown": "- [ ] ...\n> <!-- bot: note --> ...\n> <!-- bot: question --> ..."
    }
  ]
}
```

Command example:
```bash
node scripts/todolist_skill_runner.mjs write \
  --source fixture \
  --fixture fixtures/todolist-md/input \
  --suggestionsIn fixtures/todolist-md/input/llm_suggestions_for_apply.json \
  --outDir outputs/todolist-md/write
```

### Why this saves tokens
Example: if a folder has 50 Markdown files, but only 1 changed:
- LLM is called **only for that 1 file**.
- The prompt includes only extracted open tasks (`- [ ] ...`), not the entire Markdown.

## Write-back patterns

### Inline bot suggestions (current default)

Write bot-generated guidance directly under the matched task as blockquote lines.

```md
- [ ] Add release checklist #ops
  > <!-- bot: suggested --> Verify staging smoke tests before prod deploy
  > <!-- bot: note --> If staging fails, attach logs in the task details
  > <!-- bot: question --> Who is the deploy approver today?
  > <!-- bot: digest --> Next action: assign approver and lock deploy window
```

### In-file Q/A (detail blockquote, line-stable)

Ask a question using the detail blockquote line under the task:

```md
- [ ] Deploy v2.0 to production #backend
  > <!-- bot: question --> Which CI job is failing? Options: unit / integration / e2e
```

Answer by adding an inline answer on the same line to keep line-stable:

```md
- [ ] Deploy v2.0 to production #backend
  > <!-- bot: question --> Which CI job is failing? Options: unit / integration / e2e Answer: integration
```

Rules:
- Prefer one active Q/A per task at a time.
- Keep the Q/A inside the blockquote detail area.
- Do not start multi-line threads beyond the single question and optional answer line.

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

### Inline bot annotations

When the agent inserts inline suggestions near specific tasks we use a small human-facing blockquote followed by a machine-readable HTML comment. Example:

```md
- [ ] Fix login bug
  > <!-- bot: note --> Suggestion: reproduce locally and attach logs
<!-- bot: analysis-item {"original_line":"Fix login bug","suggestion":"Reproduce, collect logs","priority":"high","assignee":"frontend"} -->
```

Guidelines:
- Do not modify the original task line (no auto-complete or content replacement of the task itself).
- Prefer a short blockquote human hint (one line) and a single-line machine comment for parsing.
- Use `<!-- bot:note -->` (or `<!-- bot: question -->`) for human-facing hints and `<!-- bot: analysis-item ... -->` for machine parsing.
- Use headRevisionId gating and compare-before-write to avoid overwriting concurrent edits.
- Keep human notes short; store full structured analysis in outputs/ or Drive file metadata if you need larger payloads.

This pattern balances human readability with machine-readability while minimising file churn.

### Bot-subtask marker (inline, actionable suggestions)

To make bot-suggested subtasks actionable in a UI (Approve / Reject / Edit) we introduce a compact, machine-readable inline marker `<!-- bot: subtask {...} -->` which the runner and UI can parse without polluting task text.

Marker intent and rules:
- Purpose: represent a bot-suggested subtask that the UI can present to users as an actionable suggestion. The original task line is never modified by suggestion creation; subtasks are proposed via the comment marker.
- Visibility: include a short human-facing hint as a single-line blockquote above the marker (use `<!-- bot: note -->` for hints). Keep the human hint concise (one line).
- Machine marker: a single-line HTML comment containing a small JSON object. Keep the JSON compact to minimise file noise.

Required fields (minimal):
- id: unique id for the suggestion (e.g. `sub:6ad9b3e9` or a UUID)
- original_line: the exact or representative task text the suggestion references
- title: short subtask title
- createdAtUtc: ISO timestamp
- source_model: model name that produced the suggestion (e.g. `gpt-5-mini`)
- status: `suggested` | `approved` | `rejected` (default `suggested`)

Optional fields:
- estimate_hours
- assignee
- parent_fileId
- parent_line_hash (to detect moved/changed parent)
- suggestions_sha (reference to the overall suggestions SHA)

Example written embedding (human hint + machine marker):

```md
- [ ] dead letter queue for deep video copy #ben
  > <!-- bot: note --> Suggestion: design DLQ and alerting; approve to add subtask.
<!-- bot: subtask {"id":"sub:6ad9b3e9","original_line":"dead letter queue for deep video copy #ben","title":"Document DLQ failure scenarios","estimate_hours":1.0,"assignee":"Ben","createdAtUtc":"2026-02-16T06:02:37Z","source_model":"gpt-5-mini","status":"suggested"} -->
```

Recommended runner & UI behaviour:
- Discovery: UI or agent scans for `<!-- bot: subtask ... -->` markers and lists them in a "Bot suggestions" panel with surrounding context (task line and any human hint blockquote).
- Actions:
  - Approve: the runner inserts a real checklist subtask under the parent task (line-stable insertion), updates the subtask marker's `status` to `approved` and sets `approvedBy` / `approvedAtUtc` in the marker, and updates `last_review` / outputs state. Use headRevisionId gating and compare-before-write.
  - Reject: the runner marks `status` = `rejected` (or removes the marker) and records the action in outputs for audit.
  - Edit: the UI can modify the subtask marker before approve; the runner should accept updated marker content and then apply on Approve.
- Idempotency: subtask `id` prevents duplicate insertion; runner should check state or file content to avoid re-adding an already-approved subtask.
- Storage: persist a copy of the full suggested subtask JSON in `outputs/todolist-md/subtasks/<id>.json` for auditing and UI history. Optionally store accepted ids in Drive file.appProperties to avoid file noise.

Safety & UX notes:
- Never auto-approve suggestions unless a policy explicitly allows it (e.g., very high confidence threshold). Default: human approval required.
- Keep the human hint short to avoid visual clutter; keep the machine marker minimal and single-line.
- For trivial reminder-style tasks (e.g., "Call Alice at 3pm" or short reminders with no actionable breakdown), it's acceptable for the runner to leave no comment or machine analysis — treat these as "no-comment" items to avoid noise. The runner may still record them in outputs/state for auditing, but should not insert bot markers unless there is added value (clarifying question, subtasks, or follow-up).
- Only split a task into subtasks when doing so meaningfully reduces human work or when the subtasks are independently actionable (can be executed or assigned individually). Avoid aggressive pre-emptive splitting. Criteria the runner should use before splitting:
  - The suggestion contains multiple distinct actionable steps with separate owners/effort estimates, or
  - The runner's confidence >= 0.90 that the subtasks are correct and require no human clarification, or
  - The subtasks are automatable by an agent (e.g., create ticket, provision resource) and the auto-action is permitted by policy.
  If none of the above hold, prefer to emit a short human hint (<!-- bot: note -->) or a clarifying question (<!-- bot: question -->) rather than creating subtasks.
- Filter policy (applied before creating subtask markers):
  - Similarity check: compute normalized similarity between original line and suggested title (default threshold = 0.85). If similarity >= threshold, do not create a subtask (record as skip_similar) — emit a short human hint or record in outputs/state instead.
  - Actionability check: require the suggested title to look actionable (contain/ start with verbs like create, implement, open, contact, draft, request, schedule, setup, configure, test, verify, follow). If not actionable, do not create a subtask (record as skip_not_actionable) and instead emit a clarifying question or note.
  - Configurable: threshold and verb list are configurable via environment variables (SUGGEST_SIM_THRESHOLD, SUGGEST_ACTION_VERBS) so you can fine-tune behaviour.
- When generating subtasks, prefer creating `<!-- bot: subtask ... -->` markers (not expanded checklist) so the UI can present them for approval before insertion. Do not auto-insert expanded checklists unless explicitly approved.
- Always perform revision gating (headRevisionId) before any write; if the file changed, abort the apply and report back for manual reconciliation.
- Provide a rollback path: keep snapshots of removed/changed markers in `outputs/` to ease reverting.

Implementation steps (high level):
1. Parser: extend the runner to parse `<!-- bot: subtask ... -->` markers during plan/write and export them to `outputs/`.
2. UI: present the suggestions, allow Approve/Reject/Edit and send commands back to the agent (sessions_send or an API endpoint).
3. Approve flow: the agent downloads the current file, checks headRevisionId, inserts approved checklist lines under the parent task, updates the subtask marker to `approved` (or adds approved metadata), writes outputs and updates `last_review`.
4. Reject flow: mark or remove the marker and record the decision in outputs.
5. Tests: run end-to-end on a sample file (e.g., vyond.md) with dry-run preview and user approval before enabling automated scheduling.

### Auto‑apply policy (OPTIONAL: enable at your own risk)

You can configure the runner to automatically apply suggested changes to Drive files without manual approval. This is optional and should be used only after you trust the prompt templates, model behaviour, and have robust revision gating and backups in place.

Rules when auto‑apply is enabled:
- Auto‑apply must be explicitly enabled with an environment flag or command‑line switch (e.g. `--autoApply` or env AUTO_APPLY=true). The default remains manual approval required.
- The runner will only auto‑apply suggestions that meet a strict confidence threshold (default: 0.90). Only items with action_recommendation in {"note","follow_up","breakdown"} and confidence >= threshold are eligible. Items marked as "qa" or "refine" (clarifying questions) are never auto‑applied.
- Subtask insertion will use `<!-- bot: subtask ... -->` markers by default; the runner may expand to checklist lines only when `--expandSubtasks` is explicitly set and the item confidence >= 0.95.
- Auto‑apply will always perform revision gating (headRevisionId) and compare‑before‑write. If the remote file changed since download, the auto‑apply will abort for that file and log a conflict entry.
- A complete backup snapshot of the file will be created under `outputs/todolist-md/backups/` before any auto write; snapshots are named `<fileId>.<timestamp>.md`.
- All auto actions are logged to `/home/openclaw/.openclaw/logs/todolist-md-job.log` with one-line entries: `<UTC-ISO> fileId action result details`.
- Auto‑apply can be limited to specific file patterns (via `.todolist-md.config.json` include/exclude) and to files opted‑in with `<!-- bot: ai_enabled --> true` per file.

Safety notes:
- Never enable auto‑apply for high‑risk repositories or files that contain production scripts, credentials, or legal text without manual review.
- Keep refresh token and client credentials secure; cron jobs that auto‑apply should run under a dedicated service account with least privilege.
- If you enable auto‑apply, monitor logs for the first few runs and consider running in a staging folder first.

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
```

Bot asks a clarifying question (in-file):

```md
- [ ] Deploy v2.0 to production #backend due:2026-02-05
  > Runbook: docs/deploy.md
  > <!-- bot: question --> Which CI job is failing? Options: unit / integration / e2e
```

User answers by editing the same line (line-stable):

```md
  > <!-- bot: question --> Which CI job is failing? Options: unit / integration / e2e Answer: integration
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

### Applied suggestions hashing

To avoid re-processing files immediately after the bot writes suggestions, the runner now
records a short SHA256 hash of the bot-suggested content it wrote (state.files[<fileId>].lastAppliedHash).
On subsequent runs the plan step will skip files whose current suggestion hash matches the stored hash —
only files with real content changes will be selected for re-analysis.

This keeps the workflow simple: after you review and the bot applies suggestions, the file is considered
up-to-date until a human edits it or the file metadata indicates an external change.

### last_review includes model & hash

When the runner writes a `<!-- bot: last_review -->` line it will now include the model and a short SHA256 hash of the bot-suggested block, for example:

`<!-- bot: last_review --> 2026-02-15T16:50Z root=<rootId> model=gpt-5-mini hash=be2b...`

This makes it easy to see when a file was last updated by the bot and which model produced the suggestions. The runner only updates an existing `last_review` line; it will not add a new top-of-file header unless you explicitly allow that.


## Local fixture workflow (recommended)

Use local fixtures before enabling any remote connector:

```bash
node scripts/todolist_skill_runner.mjs plan \
  --source fixture \
  --fixture fixtures/todolist-md/input \
  --state outputs/todolist-md/folder_state.json \
  --requestOut outputs/todolist-md/llm_request.json

node scripts/todolist_skill_runner.mjs write \
  --source fixture \
  --fixture fixtures/todolist-md/input \
  --suggestionsIn fixtures/todolist-md/input/llm_suggestions_for_apply.json \
  --outDir outputs/todolist-md/write
```

Expected files:
- `outputs/todolist-md/llm_request.json`
- `outputs/todolist-md/write/<fileId>.md`


## Remote connector note

The current canonical script is fixture-first (`--source fixture`).
If you add a remote connector later (Drive/S3/local-folder), keep these rules:
- preserve stable file identity keys
- revision-gate before write
- compare-before-write and backup snapshots


## Notes about last_review
- Runner writes a `<!-- bot: last_review -->` header containing `model` and a `suggestions_sha256` after successful apply.
- The runner will compare the generated suggestions SHA256 to the file's `last_review` hash and skip apply when they match to avoid redundant writes.
