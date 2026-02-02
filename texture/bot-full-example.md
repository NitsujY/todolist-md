# Bot Integration Test Fixture

This file is a **reference Markdown** for testing Todolist-MD’s bot marker rendering.

Markers used:
- Inline markers inside task text: `<!-- bot: ... -->`
- Description markers inside a task blockquote
- Bot-suggested section: `## Tasks (bot-suggested)` + `<!-- Generated ... -->`

---

## Inbox

- [ ] Plan Q1 roadmap <!-- bot: Consider splitting into milestones (2026-02-02T10:15Z) --> #planning
  > Draft an outline and propose owners.
  >
  > <!-- bot: Question: what is the success metric for Q1? (2026-02-02T10:16Z) --> Answer: Increase weekly active users by 15%.
  > <!-- bot: Suggestion: add a “Risks” subsection. (2026-02-02T10:17Z) -->

- [ ] Fix login bug #frontend
  > Repro:
  > 1) Open app
  > 2) Click “Sign in”
  > 3) Observe blank screen
  >
  > <!-- bot: Ask for console logs + network HAR. (2026-02-02T11:01Z) -->

- [x] Buy groceries @done(2026-02-01)

---

## Project Alpha

- [ ] Build API endpoint `/v1/tasks` #backend
  > Desired behavior:
  > - Create
  > - Update
  > - List

  - [ ] Add request validation <!-- bot: Use zod schema (2026-02-02T09:05Z) -->
    > <!-- bot: Consider rate limiting if public. (2026-02-02T09:06Z) -->

  - [ ] Add integration tests

- [ ] Update UI for new endpoint #frontend
  > <!-- bot: Suggest adding a loading skeleton. (2026-02-02T09:30Z) -->

---

## Tasks (bot-suggested)
<!-- Generated 2026-02-02T12:00Z -->

- [ ] Write a short rollout plan
  > <!-- bot: Include a rollback checklist + monitoring links. -->

- [ ] Add a “Definition of Done” section to this file

---

## Notes

- You can add more `<!-- bot: ... -->` markers anywhere; the app should render them as bot callouts/badges and hide the raw HTML comment markers in edit mode.

## Bot Log

- 2026-02-02T12:30Z Plan Q1 roadmap | Archived Q/A after answer captured.
