# Bot-First (External Agent) Architecture Spec

## Overview
This spec defines the redesigned workflow where an **external agent (bot)** is the primary automation engine, and the SPA remains a lightweight Markdown viewer/editor.

## Design Principles
1. **Bot as automation brain** - All AI/automation happens outside the SPA
2. **SPA as editor/viewer** - Fast, offline-capable Markdown editing
3. **Markdown as communication layer** - bots read/write Markdown annotations
4. **Progressive enhancement** - App works without Clawdbot, but better with it

## Removed from SPA
- ❌ `src/plugins/ai-assistant/` submodule (entire folder)
- ❌ Brain Dump LLM analysis (in-browser)
- ❌ Task Breakdown LLM calls
- ❌ OpenAI/Azure API configuration in UI
- ❌ LLMService class

## Kept in SPA (Simplified)
- ✅ **Quick Capture Plugin** (new, lightweight)
  - Simple textarea for brain dumps
  - Appends to `## Brain Dump` section in markdown
  - No LLM calls
  - Voice input (browser SpeechRecognition API only, no transcription)

## Added: Bot Integration Markers

Full example (recommended reference): `texture/bot-full-example.md`.

### 1. Brain Dump Section
Users can brain dump thoughts without LLM analysis. Clawdbot processes them later.

```markdown
## Brain Dump
- Need to finish the landing page redesign
- Auth bug is still open
- Meeting with client tomorrow

<!-- Last analyzed by Clawdbot: 2026-02-02 09:00 -->
```

### 2. Inline Bot Suggestions
Bots should append analyzed/suggested guidance inline under matching tasks:

```markdown
- [ ] Complete landing page redesign #frontend due:2026-02-05
  > <!-- bot: suggested --> Break into subtasks: mockup approval, HTML structure, styling, responsive, deploy

- [ ] Fix auth null pointer bug #backend #urgent
  > <!-- bot: note --> Location: src/auth.ts line 42
  > <!-- bot: digest --> Impact: blocking production deployment
```

Users can:
- Accept (move to main task list)
- Reject (delete)
- Edit before accepting

### 3. Task Annotations
Bots can add inline comments to existing tasks:

```markdown
- [ ] Deploy v2.0 to production
  > <!-- bot: Blocked by failing integration tests. Run `npm test` first. -->
```

### 4. Clarifying Questions (In-File Q/A)

When tasks are underspecified, bots ask questions in the task description using the same marker format.

Example:

```markdown
- [ ] Deploy v2.0 to production
  > <!-- bot: Question: Which CI job is failing? Options: unit / integration / e2e --> Answer: integration
  > <!-- bot: Archived: moved to Bot Log (answered) -->
```

## UI Changes

### New: Quick Capture Button
Replace Brain Dump button with simpler capture:

**Features:**
- Fixed bottom bar (same position)
- Click → open textarea overlay
- Type or use voice-to-text (browser API)
- Save → appends to `## Brain Dump` section
- No "Generate" button (no LLM)
- Optional: notification icon when Clawdbot has analyzed brain dumps

**Visual Indicator:**
- Show "🤖 Clawdbot analyzed X items" badge
- Link to Clawdbot suggestions section

### Removed: AI Settings Panel
- No more OpenAI/Azure config
- Optional: Add "Clawdbot Status" panel showing:
  - Last analysis timestamp
  - Number of pending brain dumps
  - Link to Clawdbot dashboard

### Removed: Task Breakdown Button
- No per-task breakdown button
- Users can ask Clawdbot explicitly: "Break down task: Deploy v2.0"

## Clawdbot Skill Enhancements

Update `skills/todolist-md-clawdbot/SKILL.md` to document new workflows:

### Brain Dump Processing
```
Workflow:
1. Clawdbot scans for "## Brain Dump" section
2. Extracts unprocessed items (below last "<!-- Last analyzed -->" marker)
3. Analyzes: extract tasks, priorities, dependencies
4. Writes results to "## Tasks (Clawdbot-suggested)" section
5. Updates timestamp marker
```

### Task Analysis
```
Workflow:
1. User asks: "@clawdbot analyze my tasks"
2. Clawdbot reads all tasks
3. Identifies: overdue, blocked, quick wins, top priorities
4. Adds inline annotations (as blockquote comments)
5. Sends summary via Clawdbot chat/notification
```

### Task Breakdown
```
Workflow:
1. User asks: "@clawdbot break down 'Deploy v2.0'"
2. Clawdbot finds the task in markdown
3. Generates subtasks with context
4. Adds subtasks as indented list items
5. Confirms with user before writing
```

## Migration Path

### Step 1: Remove AI Assistant Submodule
```bash
cd /Users/justinyu/Devel/todolist-md
git rm src/plugins/ai-assistant
git commit -m "Remove AI Assistant submodule (replaced by Clawdbot)"
```

### Step 2: Create Quick Capture Plugin
Create lightweight replacement:
- `src/plugins/QuickCapturePlugin.tsx`
- Simple textarea overlay
- Voice input via browser SpeechRecognition
- Append to markdown only (no LLM)

### Step 3: Update Documentation
- README: emphasize Clawdbot as AI layer
- Remove AI Settings docs
- Add Quick Capture docs

### Step 4: Update Plugin Manifest
Remove AI Assistant, add Quick Capture

## Benefits of This Approach

### For Users
- ✅ **Faster app** - No AI bundle, smaller JS
- ✅ **Better privacy** - No API keys in browser
- ✅ **Consistent AI** - Single Clawdbot voice
- ✅ **More powerful AI** - Clawdbot has full repo context
- ✅ **Offline capture** - Brain dump works offline, syncs later

### For Developers
- ✅ **Simpler codebase** - No submodule, no LLM dependencies
- ✅ **Easier deploys** - No secret management
- ✅ **Better testing** - No mock LLM calls
- ✅ **Faster CI** - Smaller builds

### For Clawdbot Integration
- ✅ **Natural fit** - Markdown is already Clawdbot's language
- ✅ **Batch efficiency** - Analyze multiple brain dumps at once
- ✅ **Context-aware** - Clawdbot sees your whole project
- ✅ **Proactive** - Can analyze on schedule, not just on-demand

## Example User Workflow

### Morning Routine
1. User opens app, sees notification: "Clawdbot analyzed 3 brain dumps"
2. Clicks → opens Clawdbot suggestions section
3. Reviews suggested tasks
4. Accepts 2, edits 1, rejects 1
5. Clawdbot moves accepted tasks to main list

### Brain Dump Session
1. User has idea while walking
2. Opens app on phone
3. Taps Quick Capture button
4. Says: "Remember to update privacy policy before launch, check with legal team"
5. Taps Save → appends to Brain Dump section
6. Closes app
7. Later: Clawdbot sees the brain dump, creates task with due date + dependencies

### Task Management
1. User sees task: "Deploy v2.0"
2. Thinks: "This is too big"
3. Sends message: "@clawdbot break down 'Deploy v2.0'"
4. Clawdbot analyzes, suggests 7 subtasks
5. User confirms
6. Clawdbot adds subtasks to markdown

## Technical Implementation Notes

### Quick Capture Plugin API
```typescript
export const QuickCapturePlugin: Plugin = {
  name: 'Quick Capture',
  
  renderGlobal: () => <QuickCaptureButton />,
  
  // Optional: show Clawdbot status
  renderSettings: () => <ClawdbotStatus />
};
```

### Markdown Template
```markdown
# My Todo List

## Tasks
- [ ] Deploy v2.0 #backend
- [ ] Write blog post #content

## Brain Dump
<!-- Quick notes and ideas - Clawdbot processes these periodically -->
- Need to update docs
- Check with design team about new colors

<!-- Last analyzed by Clawdbot: 2026-02-02 09:00 -->

## Tasks (Clawdbot-suggested)
<!-- Generated by Clawdbot on 2026-02-02 09:00 -->
<!-- Review these and move to Tasks section when ready -->

- [ ] Update API documentation #docs due:2026-02-05
- [ ] Schedule design review meeting #meeting
```

## Future Enhancements

### Phase 2: Clawdbot Status API (optional)
If Clawdbot exposes a status API:
- Show "last analyzed" timestamp in UI
- Show "pending brain dumps" count
- Show Clawdbot activity log

### Phase 3: Real-time Webhook (advanced)
If Clawdbot can webhook back to browser:
- Real-time notifications when analysis completes
- Live updates to suggestions section
- Optional: Clawdbot chat embedded in app

### Phase 4: Hybrid Mode (enterprise)
For teams that need instant AI:
- Quick Capture can call Clawdbot API directly
- Gets immediate response (not periodic digest)
- Requires Clawdbot server deployment

## Open Questions

1. **Brain Dump UI**: Keep voice input or text-only?
   - Recommendation: Keep browser SpeechRecognition (no transcription service needed)

2. **Clawdbot Suggestions Section**: Auto-merge or manual review?
   - Recommendation: Manual review (safer, user stays in control)

3. **Plugin Packaging**: Keep as plugin or built-in?
   - Recommendation: Built-in "Quick Capture" feature (core functionality)

4. **Offline Behavior**: What if Clawdbot is unreachable?
   - Recommendation: Brain dumps accumulate, sync when Clawdbot is back

5. **Migration Path**: Deprecate old brain dumps or preserve?
   - Recommendation: One-time migration script to extract old transcripts

## Success Metrics

### SPA Performance
- Bundle size reduction: -200KB (estimate)
- Initial load time: -500ms (estimate)
- Zero LLM API errors (moved to Clawdbot)

### User Experience
- Quick Capture usage: track daily captures
- Clawdbot acceptance rate: % of suggestions accepted
- Time to task creation: measure brain dump → accepted task

### Clawdbot Integration
- Brain dump processing time: target <5min
- Analysis accuracy: user feedback
- Batch efficiency: tasks analyzed per Clawdbot run
