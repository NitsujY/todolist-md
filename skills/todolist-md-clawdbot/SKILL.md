---
name: todolist-md-clawdbot
description: Use todolist-md (Markdown-first todo lists) with Clawdbot. Read Markdown todo files regularly, summarize and prioritize tasks, suggest next steps, and optionally execute well-defined tasks with confirmation. Use when you want Clawdbot automation around todolist-md (digest, coaching, or agentic execution) based on GFM task lists.
---

# todolist-md-clawdbot

This skill helps Clawdbot work with **todolist-md** markdown todos.

## Data conventions (what Clawdbot expects)
- Tasks use **GFM** checkboxes: `- [ ]` and `- [x]`
- Optional tags: `#tag`
- Optional due date: `due:YYYY-MM-DD`
- Optional description: a blockquote right under the task

Example:
```md
- [ ] Update README for Clawdbot integration #docs due:2026-02-05
  > Include SEO keywords and a quick start
```

## Workflow (recommended)

### 1) Locate the todo source
Prefer real files (automation-friendly):
- File System folder (a directory of `.md` files)
- Google Drive folder (download/sync to files, or operate via Drive API)

Avoid:
- LocalStorage-only lists (not accessible out-of-browser)

### 2) Read + summarize
When asked to "check my todos", do:
1. Identify which files are in scope
2. Extract open tasks (`- [ ]`)
3. Group by tag / due date / section header
4. Output:
   - Top 3 next actions
   - Overdue items
   - Questions / missing info

### 3) Execute (optional, confirm first)
Only execute tasks when:
- The user explicitly asks, OR the task is low-risk and user has opted-in
- Always confirm before:
  - Sending messages/emails
  - Creating calendar events
  - Pushing code / opening PRs

## Suggested periodic digest
- Daily: overdue + top 3 next actions
- Weekly: review stale tasks + cleanup suggestions

## Notes
- Keep outputs concise and actionable.
- Prefer step-by-step suggestions.
