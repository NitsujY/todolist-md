# Implementation Status: What's Missing

**Branch**: `feature/clawdbot-pure-markdown-migration`  
**Date**: February 2, 2026  
**Last Updated**: February 2, 2026 - Post CRITICAL implementations

---

## ✅ Completed

### Core Migration
- [x] Removed AI Assistant submodule
- [x] Removed AI dependencies (@ai-sdk packages)
- [x] Updated plugin manifest
- [x] Updated README.md
- [x] Updated SPECIFICATION.md
- [x] Build verified and working
- [x] All existing plugins working

### CRITICAL Features (Now Implemented ✅)
- [x] **File Change Detection** - polls mtime every 5s, shows reload banner
- [x] **Clawdbot-Aware Rendering** - parses/styles `<!-- Clawdbot: ... -->` comments
- [x] **ClawdbotCommentView** - blue background, 🤖 icon, relative timestamps
- [x] **ClawdbotSuggestedSection** - Accept/Reject buttons for suggested tasks

### Documentation
- [x] Migration plan (MIGRATION_SUMMARY.md)
- [x] Migration guide (docs/CLAWDBOT_AI_MIGRATION.md)
- [x] Clawdbot skill updated (skills/todolist-md-clawdbot/SKILL.md)
- [x] Architecture spec (specs/features/clawdbot-first-ai.md)
- [x] Voice Capture spec (specs/plugins/voice-capture-plugin.md)
- [x] Viewer improvements spec (specs/architecture/viewer-first-improvements.md)

---

## ❌ Not Implemented (Spec Only)

### 1. Voice Capture Plugin 🎤
**Status**: Spec written, code NOT implemented  
**Spec**: `specs/plugins/voice-capture-plugin.md`  
**Priority**: Optional (nice-to-have)

**What it would do**:
- Voice-to-text using browser SpeechRecognition API
- No LLM analysis (just speech → text)
- Appends to "## Brain Dump" section
- Clawdbot processes later

**Implementation needed**:
- [ ] `src/plugins/VoiceCapturePlugin.tsx` - Main plugin
- [ ] `src/plugins/VoiceCapturePlugin/components/VoiceButton.tsx` - Bottom button
- [ ] `src/plugins/VoiceCapturePlugin/components/VoiceOverlay.tsx` - Recording UI
- [ ] `src/plugins/VoiceCapturePlugin/hooks/useSpeechRecognition.ts` - Speech API wrapper
- [ ] Add to plugin manifest
- [ ] Add browser API type definitions

**Estimated effort**: 1-2 days  
**Dependencies**: None (optional feature)

---

### 2. Clawdbot Suggested Tasks UI in App.tsx 📝
**Status**: Component created, NOT integrated into App.tsx  
**Priority**: P2 - HIGH (completes Accept/Reject workflow)

**What's done**:
- ✅ `ClawdbotSuggestedSection` component exists
- ✅ `parseClawdbotSuggestedSection()` utility exists
- ✅ `removeClawdbotSuggestedTask()` utility exists

**What's needed**:
- [ ] Parse markdown for "## Tasks (Clawdbot-suggested)" section in App.tsx
- [ ] Render ClawdbotSuggestedSection component above main task list
- [ ] Implement Accept handler: move task to main Tasks section, remove from suggested
- [ ] Implement Reject handler: just remove from suggested section
- [ ] Update markdown when accepting/rejecting

**Estimated effort**: 2-3 hours  

**Dependencies**: None, but essential for smooth Clawdbot UX

---

### 3. Keyboard Shortcuts ⌨️
**Status**: Spec written, code NOT implemented  
**Spec**: `specs/architecture/viewer-first-improvements.md` (Priority 2)  
**Priority**: ⭐⭐ High (power user feature)

**What it would do**:
- `Space` - Toggle task complete
- `E` - Edit task
- `D` - Delete task
- `N` - New task
- `R` - Reload from disk
- `/` - Search

**Implementation needed**:
- [ ] Install `react-hotkeys-hook` or similar
- [ ] Global keyboard handler
- [ ] Conflict resolution (don't trigger when typing)
- [ ] Visual hints (keyboard shortcut overlay)

**Estimated effort**: 1 day  
**Dependencies**: None

---

### 4. Virtual Scrolling 📜
**Status**: Spec written, code NOT implemented  
**Spec**: `specs/architecture/viewer-first-improvements.md` (Priority 2)  
**Priority**: ⭐⭐ High (performance)

**What it would do**:
- Render only visible tasks (not all 1000+)
- Smooth scrolling even with large files
- Significantly faster for big lists

**Implementation needed**:
- [ ] Install `@tanstack/react-virtual`
- [ ] Wrap task list with virtualizer
- [ ] Calculate item heights
- [ ] Handle expand/collapse (dynamic heights)

**Estimated effort**: 2-3 days  
**Dependencies**: None, but helps with large files

---

### 6. Clawdbot Status Panel 📊
**Status**: Spec written, code NOT implemented  
**Spec**: `specs/architecture/viewer-first-improvements.md` (Priority 3)  
**Priority**: ⭐ Medium (nice-to-have)

**What it would do**:
- Show Clawdbot status in UI (top-right corner)
- Display last check time
- Show pending suggestions count
- Manual "Check Now" button

**Implementation needed**:
- [ ] Clawdbot status component
- [ ] Read Clawdbot metadata from markdown
- [ ] Parse `<!-- clawdbot-metadata -->` markers
- [ ] Manual trigger (call Clawdbot CLI or API)

**Estimated effort**: 1-2 days  
**Dependencies**: Clawdbot must write metadata markers

---

### 7. Mobile Gestures 📱
**Status**: Spec written, code NOT implemented  
**Spec**: `specs/architecture/viewer-first-improvements.md` (Priority 3)  
**Priority**: ⭐ Medium (mobile UX)

**What it would do**:
- Swipe left → Mark complete
- Swipe right → Show actions menu
- Long press → Select multiple
- Pull down → Refresh

**Implementation needed**:
- [ ] Touch event handlers
- [ ] Gesture detection library
- [ ] Mobile-specific CSS
- [ ] Bottom sheet action menus

**Estimated effort**: 3-4 days  
**Dependencies**: None, mobile-specific

---

## 🎯 Recommended Implementation Priority

### Phase 1: Essential Clawdbot Integration (Week 1)
**Must-have for Clawdbot to work smoothly**

1. **File Change Detection** ⭐⭐⭐
   - Without this, users won't see Clawdbot's changes
   - They'll manually refresh or overwrite Clawdbot's work
   - **Start here!**

2. **Clawdbot-Aware Rendering** ⭐⭐⭐
   - Users need to distinguish Clawdbot vs user content
   - Accept/Reject UI is critical
   - **Do this second**

### Phase 2: Power User Features (Week 2)
**Nice to have, improves UX significantly**

3. **Keyboard Shortcuts** ⭐⭐
   - Quick to implement
   - Big productivity boost
   - **Easy win**

4. **Virtual Scrolling** ⭐⭐
   - Only needed if users have 500+ tasks
   - Can wait until performance becomes an issue

### Phase 3: Optional Enhancements (Week 3+)
**Enhance but not essential**

5. **Voice Capture Plugin** 🎤 (Optional)
   - Only if users want voice input
   - Clawdbot processes text either way
   - **Can skip if not needed**

6. **Clawdbot Status Panel** ⭐
   - Nice visual feedback
   - Not critical (users can check markdown directly)

7. **Mobile Gestures** ⭐
   - Only if many mobile users
   - Desktop works fine without it

---

## 📋 Quick Start: Implement File Change Detection

Since this is the most critical missing piece, here's how to start:

### Step 1: Add File Watcher to File System Adapter

```typescript
// src/adapters/FileSystemAdapter.ts

class FileSystemAdapter {
  private lastModified: number = 0;
  private watchInterval: number | null = null;

  async startWatching() {
    // Poll every 5 seconds
    this.watchInterval = window.setInterval(async () => {
      const file = await this.fileHandle.getFile();
      if (file.lastModified > this.lastModified) {
        // File changed externally!
        this.onExternalChange?.(file.lastModified);
      }
    }, 5000);
  }

  stopWatching() {
    if (this.watchInterval) {
      clearInterval(this.watchInterval);
    }
  }

  // Callback when file changes
  onExternalChange?: (newModTime: number) => void;
}
```

### Step 2: Add UI Banner

```typescript
// src/components/FileChangedBanner.tsx

export const FileChangedBanner = () => {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Listen for external file changes
    const adapter = useTodoStore.getState().adapter;
    if (adapter instanceof FileSystemAdapter) {
      adapter.onExternalChange = () => setShow(true);
      adapter.startWatching();
    }
    return () => adapter?.stopWatching();
  }, []);

  if (!show) return null;

  return (
    <div className="alert alert-info">
      <span>📝 File changed by Clawdbot</span>
      <button onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
};
```

### Step 3: Add to App

```typescript
// src/App.tsx
import { FileChangedBanner } from './components/FileChangedBanner';

function App() {
  return (
    <>
      <FileChangedBanner />
      {/* rest of app */}
    </>
  );
}
```

**Estimated time**: 2-3 hours to implement basic version

---

## 🧪 Testing Checklist

When implementing features, test:

### File Change Detection
- [ ] Create/edit file in File System mode
- [ ] Modify file externally (simulate Clawdbot edit)
- [ ] Banner appears within 5-10 seconds
- [ ] Reload button works
- [ ] No false positives when user edits

### Clawdbot Rendering
- [ ] Clawdbot comments have blue background
- [ ] Robot icon appears
- [ ] Suggested tasks section has Accept/Reject buttons
- [ ] Timestamps show "X hours ago"
- [ ] Accept moves task to main list
- [ ] Reject removes suggestion

### Voice Capture (if implemented)
- [ ] Mic button appears at bottom
- [ ] Click starts recording
- [ ] Real-time transcript shows
- [ ] Finish appends to Brain Dump section
- [ ] Works on mobile Safari
- [ ] Works on Chrome desktop
- [ ] Graceful fallback on Firefox

---

## 📊 Feature Matrix

| Feature | Spec | Code | Priority | Effort | Status |
|---------|------|------|----------|--------|--------|
| AI Assistant Removal | ✅ | ✅ | Critical | 1 day | ✅ Done |
| File Change Detection | ✅ | ❌ | Critical | 2-3 days | 🔴 Blocked UX |
| Clawdbot Rendering | ✅ | ❌ | Critical | 2-3 days | 🔴 Blocked UX |
| Keyboard Shortcuts | ✅ | ❌ | High | 1 day | 🟡 Nice-to-have |
| Virtual Scrolling | ✅ | ❌ | High | 2-3 days | 🟡 Performance |
| Voice Capture Plugin | ✅ | ❌ | Optional | 1-2 days | ⚪ Optional |
| Clawdbot Status Panel | ✅ | ❌ | Medium | 1-2 days | 🟡 Polish |
| Mobile Gestures | ✅ | ❌ | Medium | 3-4 days | 🟡 Mobile only |

---

## 🚦 Summary

### Critical Path (Do This Next!)
1. **File Change Detection** - Users can't see Clawdbot changes without this
2. **Clawdbot-Aware Rendering** - Users can't distinguish AI vs human content

### Nice to Have (Later)
- Keyboard shortcuts
- Virtual scrolling
- Voice capture
- Status panel
- Mobile gestures

### Current State
- ✅ Migration complete
- ✅ App works (pure markdown viewer)
- ✅ Clawdbot skill ready
- ❌ No UI for seeing Clawdbot changes (manual refresh only)
- ❌ No special styling for Clawdbot content

**Bottom line**: The app is a functional markdown viewer, but needs File Change Detection + Clawdbot Rendering to be truly "Clawdbot-aware".

---

## 💡 Recommendation

**Start with File Change Detection** (Priority 1, 2-3 hours):
- Quick to implement
- Biggest impact on UX
- Enables smooth Clawdbot integration

**Then add Clawdbot Rendering** (Priority 1, 2-3 days):
- Makes Clawdbot content visible and actionable
- Completes the "Clawdbot-first" vision

**Everything else can wait** until these two are done.

---

**Want me to implement File Change Detection now?** I can create the code for it.
