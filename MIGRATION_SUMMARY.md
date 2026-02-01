# Pure Markdown Viewer + Clawdbot AI Migration Summary

**Branch**: `feature/clawdbot-pure-markdown-migration`
**Date**: February 2, 2026
**Decision**: Option 3 - Pure Markdown Viewer with External Clawdbot AI

---

## 🎯 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  todolist-md SPA (Pure Markdown Viewer)                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ • Fast markdown rendering                           │   │
│  │ • Real-time file sync                               │   │
│  │ • (Optional) Voice capture (speech-to-text only)    │   │
│  │ • NO AI/LLM logic                                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                           ↕                                 │
│                    Markdown Files                           │
│         (.md files in File System / Google Drive)           │
│                           ↕                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Clawdbot (External AI Engine)                       │   │
│  │ • Smart polling (6hr + change-triggered)            │   │
│  │ • Process brain dumps → create tasks                │   │
│  │ • Analyze tasks → add comments                      │   │
│  │ • Mark tasks complete (when verified)               │   │
│  │ • Create subtasks / follow-ups                      │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 What Changes

### ❌ Removed from SPA
- `src/plugins/ai-assistant/` (entire submodule)
- `@ai-sdk/google`, `@ai-sdk/openai`, `ai` npm packages
- Brain Dump with LLM analysis
- Task Breakdown with LLM
- OpenAI/Azure API configuration
- All in-browser AI calls

### ✅ Kept (Simplified)
- Core markdown viewer/editor
- File System & Google Drive adapters
- Plugin system
- All non-AI plugins (Theme, Focus Mode, Due Date, etc.)

### ➕ Added (Optional)
- Voice Capture plugin (browser SpeechRecognition only, no LLM)
- File change detection (auto-reload when Clawdbot modifies files)
- Clawdbot-aware rendering (style Clawdbot comments differently)

### 🎨 Recommended Improvements
See `specs/architecture/viewer-first-improvements.md` for:
- Real-time sync
- Enhanced task rendering
- Clawdbot status panel
- Performance optimizations
- Mobile UX improvements

---

## 🤖 Clawdbot Behavior

### Polling Schedule
- **Default**: Check every 6 hours
- **Change-triggered**: If markdown modified → check within 15 minutes
- **Rate limit**: Max 1 check per 15 minutes
- **Quiet hours**: Skip 10 PM - 7 AM (optional)

### What Clawdbot Does

#### 1. Process Brain Dumps
```markdown
## Brain Dump
- Need to deploy v2.0 soon
- Auth bug is blocking

↓ Clawdbot analyzes ↓

## Tasks (Clawdbot-suggested)
- [ ] Deploy v2.0 to production #urgent due:2026-02-05
- [ ] Fix auth blocking bug #backend #blocker
```

#### 2. Add Task Comments
```markdown
- [ ] Deploy v2.0 to production
  > <!-- Clawdbot: Staging tests passed. Ready to deploy. -->
  > <!-- Last checked: 2026-02-02 09:00 -->
```

#### 3. Mark Tasks Complete (when verified)
```markdown
- [x] Fix auth bug
  > <!-- Clawdbot: Verified fixed in commit abc123. Marked complete. -->
```

#### 4. Create Subtasks
```markdown
- [ ] Build landing page
  - [ ] Design mockup <!-- Clawdbot: Added -->
  - [ ] HTML structure <!-- Clawdbot: Added -->
  - [ ] CSS styling <!-- Clawdbot: Added -->
```

#### 5. Track Metadata
```markdown
<!-- clawdbot-metadata
last-checked: 2026-02-02T09:00:00Z
last-modified: 2026-02-02T08:45:00Z
pending-brain-dumps: 2
suggested-tasks: 3
-->
```

---

## 🎤 Voice Capture (Optional Plugin)

### Purpose
Convert speech to text for quick brain dumps. **No AI analysis**.

### Workflow
```
1. User taps mic button
2. Speaks: "Need to deploy v2 soon"
3. Plugin converts speech → text using browser API
4. Appends to markdown:
   ## Brain Dump
   - [Voice 2026-02-02 09:15] Need to deploy v2 soon
5. Clawdbot processes it later (6hr interval or change-triggered)
```

### Key Points
- Uses browser's native SpeechRecognition API
- No external services (privacy-friendly)
- No LLM calls (Clawdbot handles analysis)
- Works offline for capture (syncs when online)

**Full spec**: `specs/plugins/voice-capture-plugin.md`

---

## 📊 Benefits

### Performance
- **Bundle size**: -200 KB (no AI SDK)
- **Load time**: -500ms (lighter app)
- **No API errors**: All LLM calls moved to Clawdbot

### Privacy & Security
- **No API keys in browser**: Clawdbot handles keys server-side
- **No audio uploads**: Voice capture uses browser API only
- **Data ownership**: Markdown files in your File System/Google Drive

### User Experience
- **Consistent AI**: Single Clawdbot intelligence (no conflicting analyses)
- **More context**: Clawdbot sees entire project, not just current file
- **Offline capture**: Voice notes saved locally, processed when online
- **Proactive AI**: Clawdbot can analyze on schedule, not just on-demand

### Developer Experience
- **Simpler codebase**: No submodule, no LLM dependencies
- **Easier deploys**: No secret management
- **Faster CI**: Smaller builds
- **No merge conflicts**: Removed problematic submodule

---

## 🚀 Migration Steps (Summary)

```bash
# 1. Create migration branch (✅ DONE)
git checkout -b feature/clawdbot-pure-markdown-migration

# 2. Remove AI Assistant submodule
git rm -f src/plugins/ai-assistant
rm -rf .git/modules/src/plugins/ai-assistant

# 3. Update .gitmodules (remove ai-assistant entry)

# 4. Remove AI dependencies
npm uninstall @ai-sdk/google @ai-sdk/openai ai

# 5. Update plugin manifest
# Remove: ai-assistant entry
# Add (optional): voice-capture entry

# 6. (Optional) Implement Voice Capture plugin
# See: specs/plugins/voice-capture-plugin.md

# 7. Update documentation
# - README.md: Remove AI sections
# - SPECIFICATION.md: Reference Clawdbot as AI layer

# 8. Install Clawdbot skill
clawdhub install todolist-md-clawdbot

# 9. Test & commit
npm install && npm run build
git add -A
git commit -m "Migrate to pure markdown viewer with Clawdbot AI"
git push origin feature/clawdbot-pure-markdown-migration
```

**Full guide**: `docs/CLAWDBOT_AI_MIGRATION.md`

---

## 📁 New Documentation

### Created Files
1. **`specs/features/clawdbot-first-ai.md`**
   - Architecture spec for Clawdbot-first design

2. **`specs/plugins/voice-capture-plugin.md`**
   - Voice Capture plugin specification (no LLM)

3. **`specs/architecture/viewer-first-improvements.md`**
   - Recommended app improvements as a viewer
   - Real-time sync, enhanced rendering, UX polish

4. **`docs/CLAWDBOT_AI_MIGRATION.md`**
   - Step-by-step migration guide (updated for Option 3)

### Updated Files
1. **`skills/todolist-md-clawdbot/SKILL.md`**
   - Added smart polling schedule (6hr + change-triggered)
   - Added processing workflow details
   - Added write-back guidelines
   - Added file watching options

---

## 🎯 Recommended App Improvements

### Priority 1: Real-Time Sync ⭐⭐⭐
**Why**: Users need to see Clawdbot changes immediately

**What**:
- File change detection (poll mtime every 5-10 seconds)
- Auto-reload banner: "File changed. [Reload]"
- Smart merging (avoid conflicts when user is editing)

**Estimated effort**: 1-2 days

### Priority 2: Clawdbot-Aware Rendering ⭐⭐⭐
**Why**: Distinguish Clawdbot-generated content from user content

**What**:
- Style Clawdbot comments with blue background + robot icon
- Render "Tasks (Clawdbot-suggested)" section with special UI
- Show Accept/Reject buttons for suggested tasks
- Relative timestamps ("2 hours ago")

**Estimated effort**: 2-3 days

### Priority 3: Performance (Virtual Scrolling) ⭐⭐
**Why**: Large markdown files (1000+ tasks) can be slow

**What**:
- Virtual scrolling (render only visible tasks)
- Incremental parsing (only re-parse changed sections)
- Lazy-load task descriptions

**Estimated effort**: 3-5 days

### Priority 4: Keyboard Shortcuts ⭐⭐
**Why**: Power users expect fast keyboard navigation

**What**:
- `Space` - Toggle task complete
- `E` - Edit task
- `D` - Delete task
- `N` - New task
- `R` - Refresh from disk
- `/` - Search

**Estimated effort**: 1 day

### Priority 5: Mobile UX ⭐
**Why**: Many users will use this on mobile

**What**:
- Swipe gestures (left = complete, right = actions)
- Bottom sheet action menus
- Touch-optimized tap targets
- Compact mode by default

**Estimated effort**: 3-4 days

**Full details**: `specs/architecture/viewer-first-improvements.md`

---

## 🔔 User Communication

### What Users Will Notice
1. **App loads faster** (~200KB lighter)
2. **No more "Generate" button** in Brain Dump
3. **Voice capture still works** (just no instant AI analysis)
4. **Clawdbot suggestions appear periodically** (not instantly)
5. **New: Clawdbot status indicator** (shows last check time)

### Migration Message (for users)
```
🎉 todolist-md is now even faster!

What's new:
• 200KB lighter (faster load times)
• Voice capture still available (optional plugin)
• Clawdbot now handles all AI analysis (more powerful!)

What changed:
• Brain dumps no longer analyzed instantly in-app
• Clawdbot processes them periodically (every 6 hours)
• Or ask: "@clawdbot check my todos" for instant analysis

Why this is better:
• Clawdbot sees your entire project (not just current file)
• More consistent AI analysis
• Better privacy (no API keys in browser)
• Proactive task management (Clawdbot works while you sleep!)

Setup:
1. Install Clawdbot skill: clawdhub install todolist-md-clawdbot
2. (Optional) Enable Voice Capture plugin in Settings
3. Start using! Clawdbot will check your todos automatically.
```

---

## ✅ Success Criteria

### Technical
- [ ] AI Assistant submodule removed
- [ ] @ai-sdk dependencies removed
- [ ] Bundle size reduced by ~200KB
- [ ] No AI/LLM code in SPA
- [ ] (Optional) Voice Capture plugin implemented
- [ ] Clawdbot skill updated and tested

### User Experience
- [ ] App loads in < 1 second
- [ ] Voice capture works (if enabled)
- [ ] File changes detected and UI updates
- [ ] Clawdbot suggestions rendered clearly
- [ ] No regression in core todo functionality

### Documentation
- [ ] README updated
- [ ] SPECIFICATION updated
- [ ] Migration guide complete
- [ ] Clawdbot skill documented
- [ ] Voice Capture spec written
- [ ] Viewer improvements documented

---

## 📅 Timeline

### Week 1: Core Migration
- Remove AI Assistant submodule
- Remove dependencies
- Update documentation
- Test core functionality

### Week 2: Viewer Improvements (Phase 1)
- File change detection
- Clawdbot comment styling
- Keyboard shortcuts
- Basic sync UI

### Week 3: Viewer Improvements (Phase 2)
- Virtual scrolling
- Clawdbot status panel
- Mobile gestures
- Performance optimizations

### Week 4: Polish & Launch
- Voice Capture plugin (optional)
- Final testing
- User communication
- Deploy to production

---

## 🎓 Lessons Learned

### Why Option 3 (Pure Markdown) Is Best
1. **Separation of concerns**: SPA does viewing, Clawdbot does AI
2. **Simpler codebase**: Easier to maintain and extend
3. **Better security**: No API keys exposed
4. **More powerful AI**: Clawdbot has full project context
5. **Proactive assistant**: Clawdbot works autonomously
6. **Future-proof**: Easy to swap/upgrade AI engine

### What We Avoided
- Complex in-browser LLM orchestration
- API key management in SPA
- Merge conflicts with AI submodule
- Duplicate AI logic (app + Clawdbot)
- Large bundle sizes

---

## 🔮 Future Enhancements

### Phase 2: Enhanced Sync
- Real-time file watching (inotify/FSEvents)
- Conflict resolution UI
- Multi-file workspace view

### Phase 3: Clawdbot Integration UI
- Clawdbot chat embedded in sidebar
- Manual trigger button ("Ask Clawdbot Now")
- Activity timeline (what Clawdbot did)

### Phase 4: Collaboration
- Multiple users viewing same markdown
- Presence indicators
- Comments & mentions

---

## 📚 Related Documents

1. [Clawdbot Integration Spec](../specs/integrations/clawdbot.md)
2. [Clawdbot-First AI Architecture](../specs/features/clawdbot-first-ai.md)
3. [Voice Capture Plugin Spec](../specs/plugins/voice-capture-plugin.md)
4. [Viewer-First Improvements](../specs/architecture/viewer-first-improvements.md)
5. [Migration Guide](./CLAWDBOT_AI_MIGRATION.md)
6. [Clawdbot Skill File](../skills/todolist-md-clawdbot/SKILL.md)

---

## 📞 Support & Questions

**For implementation questions**:
- See migration guide: `docs/CLAWDBOT_AI_MIGRATION.md`
- See architecture docs in `specs/`

**For Clawdbot setup**:
- Install skill: `clawdhub install todolist-md-clawdbot`
- See skill docs: `skills/todolist-md-clawdbot/SKILL.md`

**For app improvements**:
- See: `specs/architecture/viewer-first-improvements.md`
- Start with "Week 1" quick wins

---

**Status**: ✅ Documentation complete, ready for implementation
**Next**: Execute migration steps in `docs/CLAWDBOT_AI_MIGRATION.md`
