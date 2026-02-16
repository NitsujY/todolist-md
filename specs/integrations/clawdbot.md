# Bot Integration Spec (External Agents)

This spec describes how **external agents** (Clawdbot or any other bot) can interact with `todolist-md` by reading/writing Markdown files.

## Goal
- Keep the app **AI-free** (viewer/editor only)
- Make Markdown files the **source of truth** for both humans and bots
- Provide a minimal, bot-compatible convention for:
  - suggestions
  - questions
  - answers (user responses)

## Non-goals
- No mandatory backend service
- No proprietary database

## Data conventions (must)
- GFM tasks: `- [ ]` and `- [x]`
- Tags: `#tag`
- Due date: `due:YYYY-MM-DD`
- Description: a blockquote under a task (existing description mechanism)

## Bot marker format (only supported)

Bots may add hidden HTML comment markers anywhere in task text/description:

```md
<!-- bot: Your note here -->
```

Notes:
- The app renders these markers as bot callouts/badges.
- The raw `<!-- ... -->` should not be shown in edit UX.

## Questions & answers (recommended workflow)

### Where does the user answer?
The **user answers in the todo app** (by editing the Markdown), because the Markdown file is the system of record.

Bots can ask questions in Clawdbot chat, but the answer should be written back into the Markdown file so:
- the user sees it in the app
- future bots can read it
- the result is auditable

### How does Q/A look in Markdown?

Bot asks (single line):

```md
- [ ] Plan Q1 roadmap
  > <!-- bot: Question: what is the success metric for Q1? -->
```

User answers (preferred, same line to avoid shifting task IDs):

```md
- [ ] Plan Q1 roadmap
  > <!-- bot: Question: what is the success metric for Q1? --> Answer: Increase weekly active users by 15%.
```

This convention is intentionally simple:
- Bot writes a `<!-- bot: Question: ... -->` marker.
- User writes an `Answer: ...` (preferably on the same line as the marker).

### After the user answers (what bots should do)

If the task now has all information it needs, bots should **stop re-asking** and either:

**B) Archive to a Bot Log (recommended)**
- Append a log entry under a `## Bot Log` section (ideally at the end of the file).
- Replace the original question line **in-place** (do not delete the line) so task IDs remain stable.

Example:

```md
- [ ] Plan Q1 roadmap
  > <!-- bot: Archived: moved to Bot Log (answered) -->

## Bot Log
- 2026-02-02T12:30Z Plan Q1 roadmap | Q: success metric for Q1? | A: Increase weekly active users by 15%.
```

**C) Clear it entirely (acceptable, but keep line count stable)**
- Do not remove lines from the middle of the file.
- Instead, rewrite the question line into a short placeholder (still a `<!-- bot: ... -->` marker), e.g.:

```md
> <!-- bot: Cleared question (answered) -->
```

## Inline suggested annotations (recommended)

Bots should write suggestions inline under the matching task as blockquote markers:

```md
- [ ] Write a rollout plan
  > <!-- bot: suggested --> Include rollback steps + monitoring links.
```

## Test fixture

- Reference file: `texture/bot-full-example.md`
