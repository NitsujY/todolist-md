# Bot Integration Test Fixture

<!-- bot: last_review --> 2026-02-14T10:10Z root=demo-root model=gpt-5.3-codex

This file is a **reference Markdown** for testing all supported bot markers.

Canonical markers covered:
- `<!-- bot: question -->`
- `<!-- bot: suggested -->`
- `<!-- bot: digest -->`
- `<!-- bot: note -->`
- `<!-- bot: last_review -->`

---

<!-- bot: digest --> Top 3 next actions: 1) Unblock login fix 2) Add API validation 3) Finalize rollout checklist

## Inbox

- [ ] Plan Q1 roadmap #planning
  > Draft an outline and propose owners.
  >
  > <!-- bot: question --> What is the success metric for Q1? Options: WAU / MRR / retention Answer: Increase weekly active users by 15%.
  > <!-- bot: note --> Keep this line-stable for ID safety.

- [ ] Fix login bug #frontend
  > Repro:
  > 1) Open app
  > 2) Click “Sign in”
  > 3) Observe blank screen
  >
  > <!-- bot: question --> Which browser/version reproduces this most consistently?
  > <!-- bot: note --> Ask for console log + HAR file.

- [ ] Design empty state copy <!-- bot: note: avoid passive voice --> #ux

---

## Project Alpha

- [ ] Build API endpoint `/v1/tasks` #backend
  > Desired behavior:
  > - Create
  > - Update
  > - List
  > <!-- bot: note --> Add request id logging for traceability.

  - [ ] Add request validation <!-- bot: note: use zod schema -->
  - [ ] Add integration tests

- [ ] Update UI for new endpoint #frontend
  > <!-- bot: note --> Add loading skeleton and retry state.

---

- [ ] Plan Q1 roadmap #strategy due:2026-02-28
  > <!-- bot: suggested --> Write a short rollout plan with a measurable success metric.
  > <!-- bot: note --> Include rollback checklist + monitoring links.


## Bot Log

- 2026-02-14T10:12Z Task: Plan Q1 roadmap | Q: What is the success metric for Q1? | A: Increase weekly active users by 15%
