# Brain Dump (Context-Aware) Specification


### Primary Flow (Voice-First)

- Click the bot icon to open a **clean, full-screen voice capture screen**.
- On mobile, use a **clean, full-screen voice capture screen**.
- On desktop, use a **bottom sheet** (no more than half screen height) and **blur** the list view behind it.
- The user speaks and sees **voice → text** appear in real time.
- The user can **Stop** to pause, think, then **Continue** to resume (repeat as needed).
- When finished (via clear UI hint), the user taps **Analyze** to trigger Brain Dump analysis.
- After results show, the user can **Continue** voice again in the same screen (results should not block continued capture).

### Post-Finish Review

- After the user taps **Finish**, switch into a **review mode** that can use the full screen (desktop included).
- Show additional options (scene, include completed, etc.) only in review mode.
- Tapping the mic to continue recording exits review mode back to the clean capture screen.

#### Discoverability (Most Important)

- The UI should make **Stop / Continue** impossible to miss.
- Use a **bottom-center fixed primary control** (a circular icon button) that toggles **Pause / Continue**.
- When paused, show a **Finish** pill/button adjacent to the circle (near the same focal point).
- Keep the capture screen clean: top bar + transcript + center control only.
- Show configuration and secondary options only after finishing.

#### Reliability

- Browsers may end speech recognition unexpectedly (silence/timeout/network).
- When that happens, auto-restart listening when appropriate; otherwise show a clear paused prompt so the user can continue with one tap.
## 1. Overview

**Brain Dump** turns short, fragmented inputs (voice or typed text) into:

1. **Suggested Tasks** (action-first)
2. **Mind-Clearing Summary** (context + intent)
3. **Clarifying Prompts** (minimal questions to reduce ambiguity)
4. **Transcript / Source Text** (trust + searchability)

This feature is optimized for **brain dumps** (not long meetings).

The design respects the app’s constraints:

- **Markdown-first**: All durable state is written back into the Markdown document.
- **Serverless**: Runs in-browser. Optional private endpoint for speech/LLM.
- **Privacy-focused**: User controls where audio/transcript are stored.

## 2. User Stories

- As a user, I can speak a messy thought and get clean tasks.
- As a user, I can paste/type a brain dump (no microphone) and get the same tasks + mind-clearing output.
- As a user, I can choose a **Scene** (why I’m capturing) so the app formats output appropriately.
- As a user, I can keep a lightweight **Knowledge Base** for a list/project so extractions use prior context.
- As a user, I can review and edit suggestions before writing anything into my tasks.

## 3. UX (MVP)

### 3.1 Entry
- A single **Brain Dump** button opens the overlay.
- The overlay provides:
  - **Scene picker**
  - Optional record controls
  - Voice capture as the primary input method
  - A secondary typed input (hidden behind an explicit “Type instead” affordance)

### 3.1.1 Mobile-First Requirement (Important)
On mobile/small screens, Brain Dump is treated as a **full-screen page** (like Settings) so the user gets maximum space.

- Full-screen layout on small screens; anchored “bottom sheet” layout only on larger screens.
- Only **one** obvious close control (no duplicate Close + X).
- Content area scrolls; primary actions remain easy to reach.
- Keep the default view minimal:
  - Preview textarea + Generate
  - Tasks + Apply
  - Clear mind
  - Advanced panels stay behind “More”.

This is a core UX constraint for MVP, not a nice-to-have.

### 3.2 Stop / Generate → Review
When the user is ready to analyze (explicit):

- Voice capture supports **pause/continue** in the same overlay.
- **Stop** pauses recording and keeps the screen clean (no tasks shown yet).
- User can think for a moment, then **Continue** recording.
- When ready, user taps **Analyze** to run Brain Dump extraction.

For typed input, user clicks Generate.

1. App generates a **Context Pack** (Section 4)
2. App produces **Brain Dump Result**:
   - Suggested tasks (editable checklist)
   - Summary (1–5 bullets)
   - “To clear your mind” hints (1–3 bullets)
   - Clarifying questions (0–2 questions, optional)
   - Transcript / source text

### 3.3 Apply
- User can:
  - **Add selected tasks** to the current list (under a target section)
  - **Attach summary** as description/context (see Section 6)
  - Keep transcript/source stored (or delete after processing)

### 3.4 Preview Without Microphone (MVP)
- Users can paste or type text into a **Preview** box to generate the same Brain Dump result without starting speech recognition.
- This is intentionally not the default path when voice capture is enabled; it’s a fallback.

## 4. Context Pack (What the model sees)

Brain Dump is context-aware by sending a compact context bundle.

### 4.1 Default Context Sources (MVP)
- **Current file markdown (trimmed)**:
  - Current section header
  - Nearby tasks (e.g., last 20 open tasks in the section)
- **Recent captures**:
  - Last 3 summaries from the same file
- **Scene configuration**:
  - Scene id + instructions
- **Knowledge Base notes** (optional, user-authored)

### 4.2 Retrieval Strategy (No embeddings required)
MVP retrieval is **deterministic + cheap**:

- Recency-based: last N tasks/summaries
- Simple keyword match against:
  - source text tokens
  - task titles
  - knowledge base bullets

Future enhancement (still Markdown-first): build an **in-memory search index** derived from markdown (no backend DB).

### 4.3 Safety & Scope
- Never send more context than needed.
- Keep context to a small token budget (e.g., 2–6KB text).
- Provide toggles in settings:
  - “Include current file context”
  - “Include knowledge base notes”
  - “Include recent summaries”

## 5. Scenes (Why you’re capturing)

A **Scene** is a small preset that changes extraction style.

### 5.1 MVP Scenes
- **Brain Dump (General)**: default; mixed ideas + tasks.
- **Project Brainstorm**: prefers “ideas” + next actions; captures assumptions.
- **Development TODO**: extracts dev tasks; prefers short imperative verbs; suggests tags like `#dev`.
- **Daily Reminders**: prefers time-bound tasks; suggests `due:YYYY-MM-DD` when appropriate.

### 5.2 Scene Behavior Contract
Scenes affect:

- Task formatting (tone, granularity)
- Suggested tags
- Preferred destination section (optional)
- Clarifying questions (what matters)

### 5.3 Scene Configuration Storage (Markdown-first)
Per file, store default scene and optional scene instructions in a hidden block.

Example:

```md
<!-- AI_SCENE:START -->
{ "defaultScene": "brain-dump", "preferredSection": "Inbox" }
<!-- AI_SCENE:END -->
```

## 6. Writing Results into Markdown

### 6.1 Tasks
- Insert selected tasks as standard markdown tasks:

```md
- [ ] Follow up with Sarah about contract changes #work
- [ ] Schedule Acme demo due:2025-12-30
```

- If the summary is relevant, attach it as a **description blockquote** to the first inserted task (or a generated “Brain Dump” parent task):

```md
- [ ] Brain dump (2025-12-23)
> Summary: …
> Next actions: …
```

### 6.2 Transcript and Summary Capture (Hidden)
Continue using the existing hidden capture strategy (from the AI Assistant spec), and extend with a brain-dump result block:

```md
<!-- AI_BRAIN_DUMP:START -->
[BRAIN_DUMP <ISO_TIMESTAMP> scene=dev-todo]
Summary:
- …
Tasks:
- …
Source:
…
<!-- AI_BRAIN_DUMP:END -->
```

### 6.3 Knowledge Base Notes (User-authored)
Provide a per-file KB block that users can edit as plain markdown bullets.

```md
<!-- AI_KB:START -->
- Project Alpha: shipping by end of Q1
- “Sarah” refers to Sarah Chen (Legal)
- Acme demo is usually with Bob + Priya
<!-- AI_KB:END -->
```

## 7. LLM Prompt Contract (Recommended)

Prefer structured output so it can be applied safely.

### Output schema (JSON)
- `sceneId: string`
- `summaryBullets: string[]`
- `mindClearingHints: string[]`
- `clarifyingQuestions: { question: string; choices?: string[] }[]`
- `tasks: { title: string; tags?: string[]; dueDate?: string; confidence?: number; rationale?: string }[]`
- `sourceText: string`

## 8. Quality Bar (MVP)

- **Speed**: fast enough for “in the moment” capture.
- **Trust**: source text always visible; nothing writes without explicit Apply.
- **Low friction**: scene defaults per file; no setup required.
- **Minimal questions**: at most 0–2 clarifying questions.

## 9. Non-Goals (MVP)

- Long meeting recording (10–60 min)
- Speaker diarization
- Organization-wide knowledge base
- Heavy vector DB / server-side indexing
