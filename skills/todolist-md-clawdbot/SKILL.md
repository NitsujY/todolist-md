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
- **File System folder**: a directory of `.md` files (e.g., `~/Todos/`)
- **Google Drive folder**: download/sync to files, or operate via Drive API

Avoid:
- LocalStorage-only lists (not accessible out-of-browser)

**How to find the files:**
- Ask the user: "Where do you keep your todo markdown files?"
- Look for common locations: `~/Todos/`, `~/Documents/Tasks/`, `~/Dropbox/Tasks/`
- Check if the user has the todolist-md app open and ask which storage mode they're using

### 2) Read + summarize
When asked to "check my todos", do:
1. **Identify scope**: Which files are in scope? (all `.md` in folder, or specific file?)
2. **Extract tasks**: Parse for GFM checkboxes `- [ ]` (open) and `- [x]` (completed)
3. **Parse metadata**: Extract tags (`#tag`), due dates (`due:YYYY-MM-DD`), descriptions (blockquotes)
4. **Group intelligently**:
   - By due date: overdue, due today, due this week, no due date
   - By tag: `#urgent`, `#frontend`, `#backend`, etc.
   - By section header: if the markdown uses `## Work` and `## Personal`
5. **Output** (keep it concise):
   - 🚨 **Overdue**: X tasks (list them)
   - 🎯 **Top 3 next actions** (prioritize by: overdue > due soon > high-impact)
   - ⚠️ **Blocked/unclear**: tasks missing context or dependencies
   - ✨ **Quick wins**: small tasks that could be done in <30 min

**Example output:**
```
📊 Todo Summary (2026-02-01)

🚨 Overdue (2):
  • [Deploy v2.0 to production] #backend due:2026-01-31
  • [Update privacy policy] #legal due:2026-01-29

🎯 Top 3 Next Actions:
  1. Deploy v2.0 (overdue, high-priority)
  2. Fix auth bug - PR ready, just needs review #urgent
  3. Write blog post draft - due tomorrow #content

⚠️ Blocked:
  • [Integrate payment gateway] - missing API keys #backend

✨ Quick Wins (3 tasks under 30min)
```

### 3) Execute (optional, confirm first)
Only execute tasks when:
- The user **explicitly asks** ("Can you create the PR for me?")
- OR the task is low-risk AND user has **opted-in** to autonomous mode

**Always confirm before:**
- Sending messages/emails
- Creating calendar events
- Pushing code / opening PRs
- Marking tasks complete (unless user said "mark all done")
- Deleting or archiving tasks

**Example execution workflow:**
```
Task: - [ ] Create PR for bugfix #github
      > Fix null pointer in auth.ts line 42

Clawdbot:
  I can create this PR now:
  • Branch: fix/auth-null-pointer
  • Commit: "Fix null pointer in auth.ts line 42"
  • PR title: "Fix: Null pointer in auth service"
  
  Confirm? [Yes / No / Show me the diff first]
```

### 4) Proactive suggestions (optional)
If the user has enabled proactive mode, Clawdbot can:
- **Break down large tasks** into subtasks
- **Link related tasks** ("This depends on #123")
- **Suggest prioritization** ("These 3 tasks are blocking others")
- **Identify patterns** ("You have 5 tasks tagged #frontend - want to batch them?")

## Suggested periodic digest
- **Daily** (9 AM): overdue + top 3 next actions
- **Weekly** (Monday 9 AM): review stale tasks (no activity in 2+ weeks) + cleanup suggestions
- **On-demand**: user asks "@clawdbot check my todos"

## Advanced: Task breakdown

When the user has a large, vague task, offer to break it down:

**Input:**
```markdown
- [ ] Build new landing page #frontend
```

**Clawdbot suggests:**
```markdown
- [ ] Build new landing page #frontend
  - [ ] Design mockup in Figma
  - [ ] Create HTML structure
  - [ ] Add CSS styling with Tailwind
  - [ ] Make responsive (mobile, tablet, desktop)
  - [ ] Add animations and interactions
  - [ ] Deploy to staging
  - [ ] Get stakeholder approval
  - [ ] Deploy to production
```

**Workflow:**
1. Detect large/vague tasks (no subtasks, generic title)
2. Ask: "This looks like a big task. Want me to break it down?"
3. Generate subtasks based on:
   - Task domain (frontend → mockup, HTML, CSS, deploy)
   - Common patterns in the codebase
   - User's past task structure
4. **Confirm before adding** (show the proposed subtasks)
5. Append subtasks as indented items in the markdown

## Notes
- Keep outputs concise and actionable.
- Prefer step-by-step suggestions.
