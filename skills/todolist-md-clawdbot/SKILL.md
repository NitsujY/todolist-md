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

## Smart Polling Schedule

### Automatic Check Intervals
- **Default**: Check every **6 hours** (configurable)
- **Change-triggered**: If markdown file modified → check within **15 minutes**
- **Rate limit**: Max 1 check per 15 minutes (prevents spam)
- **Quiet hours**: Skip checks between 10 PM - 7 AM (optional)

### How Change Detection Works
```bash
# Clawdbot tracks file modification timestamps
# When file mtime changes, schedule a priority check
# Use filesystem watch or periodic stat polling
```

### Example Schedule
```
09:00 - Scheduled check (6hr timer)
10:30 - User edits todo.md → trigger check at 10:45
11:00 - Skip (rate limited, checked at 10:45)
15:00 - Scheduled check (6hr from 09:00)
16:20 - User edits todo.md → trigger check at 16:35
21:00 - Scheduled check (6hr from 15:00)
```

## Processing Workflow

When Clawdbot runs (scheduled or change-triggered):

### 1. Read & Parse Markdown
```
- Parse all tasks with GFM syntax
- Extract metadata: tags, due dates, descriptions
- Track task state: open vs completed
- Note: Brain Dump section, Clawdbot-suggested section
```

### 2. Identify Actions Needed
```
Clawdbot should:
✅ Find unresolved tasks (open tasks without recent activity)
✅ Check overdue tasks (due date < today)
✅ Detect blocked tasks (missing dependencies, unclear)
✅ Process Brain Dump items (new captures)
✅ Review Clawdbot-suggested tasks (pending user acceptance)
```

### 3. Write Back to Markdown

**Add Inline Comments** (as blockquotes):
```markdown
- [ ] Deploy v2.0 to production
  > Status: Ready to deploy
  > <!-- Clawdbot: Staging tests passed. Run: npm run deploy:prod -->
  > <!-- Last checked: 2026-02-02 09:00 -->
```

**Mark Tasks Complete** (when appropriate):
```markdown
- [x] Fix auth bug
  > <!-- Clawdbot: Verified fixed in commit abc123. Marked complete. -->
```

**Create New Tasks** (based on analysis):
```markdown
## Tasks (Clawdbot-suggested)
<!-- Generated 2026-02-02 09:00 -->

- [ ] Update deployment docs #docs
  > <!-- Clawdbot: Created because deploy process changed -->
```

**Add Follow-up Actions**:
```markdown
- [ ] Build landing page #frontend
  - [ ] Design mockup <!-- Clawdbot: Added subtask -->
  - [ ] HTML structure <!-- Clawdbot: Added subtask -->
```

### 4. Metadata Tracking

**Option A: Hidden Markers** (recommended)
```markdown
<!-- clawdbot-metadata
last-checked: 2026-02-02 09:00:00
last-modified: 2026-02-02 08:45:00
pending-brain-dumps: 2
suggested-tasks: 3
-->
```

**Option B: Separate .clawdbot.json**
```json
{
  "files": {
    "todo.md": {
      "lastChecked": "2026-02-02T09:00:00Z",
      "lastModified": "2026-02-02T08:45:00Z",
      "pendingBrainDumps": 2,
      "suggestedTasks": 3
    }
  }
}
```

## Suggested periodic digest
- **Every 6 hours**: Auto-check + process (or when changes detected)
- **Daily** (9 AM): Summary email/notification with priorities
- **Weekly** (Monday 9 AM): Stale task cleanup suggestions
- **On-demand**: "@clawdbot check my todos" or "@clawdbot process brain dumps"

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

## Clawdbot Write-back Guidelines

### When to Write
✅ **Safe writes** (always okay):
- Add comments/analysis as blockquotes
- Create new tasks in "Clawdbot-suggested" section
- Add hidden metadata markers
- Append to Brain Dump analysis

⚠️ **Cautious writes** (confirm first):
- Mark tasks as complete (unless obviously done)
- Reorder tasks
- Add subtasks to existing tasks
- Modify task titles

❌ **Never** (destructive):
- Delete tasks without confirmation
- Remove user-written content
- Overwrite descriptions

### Write Format Standards

**Comments**: Use blockquote with marker
```markdown
> <!-- Clawdbot: Your insight here -->
```

**Timestamps**: ISO format
```markdown
<!-- Last checked: 2026-02-02T09:00:00Z -->
```

**Suggested Section**: Separate, easy to review
```markdown
## Tasks (Clawdbot-suggested)
<!-- Review and move to main Tasks section when ready -->
```

## File System Watching (Implementation)

### Option A: inotify/FSEvents (Recommended)
```bash
# Watch markdown files for changes
# Trigger Clawdbot check 15min after last modification
# Uses OS-level filesystem events
```

### Option B: Polling
```bash
# Every 5 minutes: stat all markdown files
# Compare mtime with last known
# If changed: schedule priority check
```

### Option C: Git Hook (Advanced)
```bash
# Install post-commit hook
# Triggers Clawdbot on git commit
# Best for git-tracked markdown
```

## Notes
- Keep outputs concise and actionable.
- Prefer step-by-step suggestions.
- **Respect user's workspace**: Don't overwrite user content
- **Be transparent**: Always mark Clawdbot-generated content
- **Rate limit**: Avoid excessive API calls when files change frequently
