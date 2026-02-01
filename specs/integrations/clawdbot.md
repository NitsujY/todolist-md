# Clawdbot Integration Spec (Proposed)

## Goal
Make `todolist-md` easy for Clawdbot to:
1) Read markdown todos regularly
2) Suggest next steps and guidance
3) Optionally execute tasks via agent workflows

## Non-goals
- No mandatory backend service
- No proprietary database

## Data conventions (must)
- GFM tasks: `- [ ]` and `- [x]`
- Tags: `#tag`
- Due date: `due:YYYY-MM-DD`
- Optional metadata lines can be added as blockquotes under a task (existing description mechanism)

## Access patterns
Clawdbot needs file access outside the browser:
- Prefer File System folder mode (real `.md` files) or Google Drive adapter.
- LocalStorage-only mode is not suitable for automation.

## Automation safety
- Default is **read-only** analysis + suggestions.
- Any write-back (mark complete, append notes, reorder) should require explicit user confirmation.

## Suggested Clawdbot skill scope
- Parse markdown todo files in a folder/drive location
- Identify:
  - overdue tasks (due < today)
  - tasks without owners/tags
  - tasks blocked by missing info
  - quick wins (small tasks)
- Produce:
  - daily digest
  - top 3 next actions
  - optional execution plan (commands or PR steps)

## Example
Input:

- [ ] Update README for Clawdbot integration #docs due:2026-02-05
  > Include SEO keywords and quick start

Output (digest):
- Overdue: none
- Next actions:
  1) Draft README section "Clawdbot integration"
  2) Add spec file under specs/integrations/
