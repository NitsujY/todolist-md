# Clawdbot AI Migration Guide (Option 3: Pure Markdown)

## Overview
This guide walks through migrating from the in-app AI Assistant (submodule) to a **pure markdown viewer** with Clawdbot as the external AI engine.

## Decision Summary

✅ **CHOSEN: Option 3 (Pure Markdown Viewer)**

**Remove**: 
- In-app AI Assistant submodule (entire folder)
- All LLM/AI dependencies
- Brain Dump with LLM analysis

**Keep** (as optional plugin):
- Voice Capture (browser SpeechRecognition only, no LLM)

**Add**:
- Real-time file sync
- Clawdbot-aware rendering
- Enhanced viewer experience

**AI Engine**: Clawdbot (external, runs independently)

## Step-by-Step Migration

### Phase 1: Backup & Document Current State

```bash
# 1. Document current AI features being used
git log --all --oneline src/plugins/ai-assistant/ | head -20

# 2. Export current brain dump history (optional)
# Check if users have stored transcripts we need to preserve
grep -r "Brain Dump" texture/ || echo "No brain dumps in texture/"

# 3. Take a snapshot
git branch backup/before-ai-migration
```

### Phase 2: Remove AI Assistant Submodule

```bash
cd /Users/justinyu/Devel/todolist-md

# 1. Remove the submodule
git rm -f src/plugins/ai-assistant
rm -rf .git/modules/src/plugins/ai-assistant

# 2. Remove from .gitmodules (if it exists)
# Edit .gitmodules and remove ai-assistant entry

# 3. Commit the removal
git commit -m "Remove AI Assistant submodule

Migrating to Clawdbot-first architecture where:
- Clawdbot handles all LLM analysis
- SPA provides lightweight capture UI only
- No more in-browser OpenAI/Azure API calls

See: specs/features/clawdbot-first-ai.md"
```

### Phase 3: Remove AI Dependencies from package.json

```bash
# Remove AI SDK dependencies
npm uninstall @ai-sdk/google @ai-sdk/openai ai
```

Edit `package.json` - these will be removed automatically by npm uninstall:
- `@ai-sdk/google`
- `@ai-sdk/openai`
- `ai`

### Phase 4: Update Plugin Manifest

Edit `src/plugins/pluginManifest.ts`:

**Remove:**
```typescript
{
  id: 'ai-assistant',
  module: './plugins/ai-assistant/AIAssistantPlugin.tsx',
  exportName: 'AIAssistantPlugin',
  defaultEnabled: true,
  name: 'AI Assistant',
},
```

**Add (later, Phase 5):**
```typescript(Optional) Create Voice Capture Plugin

**Note**: This is optional. If you want voice capture, create `src/plugins/VoiceCapturePlugin.tsx`.

**Full spec**: See `specs/plugins/voice-capture-plugin.md`

**Simplified version** (voice-to-text only, no LLM)
  module: './plugins/QuickCapturePlugin.tsx',
  exportName: 'QuickCapturePlugin',
  defaultEnabled: true,
  name: 'Quick Capture',
  description: 'Fast capture for brain dumps. Clawdbot analyzes them later.',
},
```

### Phase 5: Create Quick Capture Plugin

Create `src/plugins/QuickCapturePlugin.tsx`:

```typescript
import { useState } from 'react';
import { Mic, X } from 'lucide-react';
import type { Plugin } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';

export const QuickCaptureButton = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const updateMarkdown = useTodoStore(state => state.updateMarkdown);
  const markdown = useTodoStore(state => state.markdown);

  const handleSave = () => {
    if (!text.trim()) return;

    // Find or create "## Brain Dump" section
    const brainDumpSection = '\n\n## Brain Dump\n<!-- Quick notes - Clawdbot processes these periodically -->\n';
    const timestamp = new Date().toISOString().split('T')[0] + ' ' + 
                     new Date().toTimeString().split(' ')[0];
    const entry = `- ${text} <!-- captured: ${timestamp} -->\n`;

    let newMarkdown = markdown;
    if (markdown.includes('## Brain Dump')) {
      // Append to existing section (after the header line)
      newMarkdown = markdown.replace(
        /(## Brain Dump\n(?:<!--.*?-->\n)?)/,
        `$1${entry}`
      );
    } else {
      // Add new section at the end
      newMarkdown = markdown + brainDumpSection + entry;
    }

    updateMarkdown(newMarkdown);
    setText('');
    setIsOpen(false);
  };

  const startVoiceCapture = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert('Voice input not supported in this browser');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = text;

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript + ' ';
        } else {
          interimTranscript += transcript;
        }
      }

      setText(finalTranscript + interimTranscript);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.start();
    setIsRecording(true);

    // Store reference to stop it later
    (window as any).__quickCaptureRecognition = recognition;
  };

  const stopVoiceCapture = () => {
    const recognition = (window as any).__quickCaptureRecognition;
    if (recognition) {
      recognition.stop();
      delete (window as any).__quickCaptureRecognition;
    }
    setIsRecording(false);
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-40">
        <button
          onClick={() => setIsOpen(true)}
          className="btn btn-primary btn-circle btn-lg shadow-lg"
          aria-label="Quick Capture"
        >
          <Mic className="w-6 h-6" />
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-base-100 rounded-lg w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-base-300 flex justify-between items-center">
          <h2 className="text-lg font-semibold">Quick Capture</h2>
          <button onClick={() => setIsOpen(false)} className="btn btn-ghost btn-sm btn-circle">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 flex-1 overflow-auto">
          <textarea
            className="textarea textarea-bordered w-full h-48 resize-none"
            placeholder="Brain dump your thoughts... Clawdbot will analyze them later."
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
          />
          <p className="text-sm text-base-content/60 mt-2">
            💡 Tip: Clawdbot processes brain dumps periodically and suggests tasks.
          </p>
        </div>

        <div className="p-4 border-t border-base-300 flex justify-between gap-2">
          <button
            onClick={isRecording ? stopVoiceCapture : startVoiceCapture}
            className={`btn ${isRecording ? 'btn-error' : 'btn-ghost'}`}
          >
            <Mic className="w-5 h-5" />
            {isRecording ? 'Stop' : 'Voice'}
          </button>
          <div className="flex gap-2">
            <button onClick={() => setIsOpen(false)} className="btn btn-ghost">
              Cancel
            </button>
            <button onClick={handleSave} className="btn btn-primary" disabled={!text.trim()}>
              Save to Brain Dump
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
VoiceCaptureButton />,
  
  renderSettings: () => (
    <div className="space-y-2">
      <h3 className="font-semibold">Voice Capture</h3>
      <p className="text-sm text-base-content/70">
        Voice-to-text capture using browser's Speech Recognition.
        No AI analysis - just converts speech to text and appends to Brain Dump section.
      </p>
      <p className="text-sm text-base-content/70">
        💡 Clawdbot processes brain dumps periodically (every 6 hours or when changes detected).
      </p>
      <div className="alert alert-info text-sm">
        <span>
          🤖 Install Clawdbot skill: <code>clawdhub install todolist-md-clawdbot</code>
        </span>
      </div>
    </div>
  ),
};

// Note: This plugin has NO LLM logic. It's just speech-to-text.
// See specs/plugins/voice-capture-plugin.md for full implementation.      </span>
      </div>
    </div>
  ),
};
```

Add type declarations in `src/vite-env.d.ts`:
```typescript
interface Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
} with LLM)

Add (optional):
- **Voice Capture** (optional plugin): Voice-to-text for quick brain dumps. No AI analysis in-app; Clawdbot processes them later

#### README.md
**Remove section**: "AI Assistant: OpenAI vs Azure OpenAI"

**Update section**: "## Features"
Remove:
- Brain Dump (AI Assistant)

Add:
- **Quick Capture**: Fast brain dump input. Clawdbot analyzes them periodically.

#### SPECIFICATION.md
**Update**: `specs/features/brain-dump.md` → Mark as deprecated
**Add**: Reference to `specs/features/clawdbot-first-ai.md`

### Phase 7: Update Clawdbot Skill

Edit `skills/todolist-md-clawdbot/SKILL.md`:

**Add new workflow section:**

```markdown
## Brain Dump Processing

### When to Run
- **Periodic**: Every 30 minutes (configurable)
- **On-demand**: When user asks "@clawdbot process brain dumps"

### How It Works
1. Read all markdown files in the configured folder
2. Find "## Brain Dump" sections
3. Extract items that don't have "<!-- analyzed: ... -->" marker
4. For each item:
   - Analyze intent
   - Extract actionable tasks
   - Identify priorities
   - Add context (due dates, tags, dependencies)
5. Create "## Tasks (Clawdbot-suggested)" section
6. Write suggested tasks with metadata
7. Add "<!-- analyzed: TIMESTAMP -->" marker to processed items

### Example Input
```markdown
## Brain Dump
- Need to finish the landing page
- Auth bug is still open
- Meeting with client tomorrow
```

### Example Output
```markdown
## Brain Dump
- Need to finish the landing page <!-- analyzed: 2026-02-02 09:00 -->
- Auth bug is still open <!-- analyzed: 2026-02-02 09:00 -->
- Meeting with client tomorrow <!-- analyzed: 2026-02-02 09:00 -->

## Tasks (Clawdbot-suggested)
<!-- Generated by Clawdbot on 2026-02-02 09:00 -->

- [ ] Complete landing page redesign #frontend due:2026-02-05
  > Subtasks: design approval, HTML, CSS, responsive, deploy
  
- [ ] Fix auth null pointer bug #backend #urgent
  > Priority: HIGH (blocking production)
  
- [ ] Schedule client meeting #meeting due:2026-02-03
  > Prepare: demo slides, Q&A doc
```

### User Review
After Clawdbot processes brain dumps:
1. User opens app
2. Sees "🤖 Clawdbot analyzed 3 items" notification
3. Reviews Clawdbot-suggested section
4. Accepts (moves to main task list) or rejects items
```

### Phase 8: Clean Up Environment Variables

Remove from `.env.local` (if exists):
```bash
# No longer needed
VITE_OPENAI_API_KEY=...
VITE_OPENAI_MODEL=...
VITE_AZURE_OPENAI_ENDPOINT=...
VITE_AZURE_OPENAI_API_VERSION=...
VITE_AZURE_OPENAI_DEPLOYMENT=...
VITE_AZURE_OPENAI_API_KEY=...
```

Remove from GitHub Secrets (deployment):
- `VITE_OPENAI_API_KEY`
- (Keep `VITE_GOOGLE_CLIENT_ID` and `VITE_GOOGLE_API_KEY` for Google Drive)

### Phase 9: Test & Verify

```bash
# 1. Install dependencies (should be smaller now)
npm install

# 2. Build
npm run build

# 3. Check bundle size (should be ~200KB smaller)
ls -lh dist/assets/*.js

# 4. Run dev server
npm run dev

# 5. Test Quick Capture
# - Click bottom button
# - Type a brain dump
# - Save
# - Verify it's in markdown under "## Brain Dump"

# 6. Test Clawdbot integration
# - Add some brain dumps
# - Run: clawdbot check-todos --dir ./texture/
# - Verify Clawdbot processes them
```

### Phase 10: Commit & Deploy

```bash
git add -A
git commit -m "Migrate to Clawdbot-first AI architecture

Changes:
- Remove AI Assistant submodule
- Remove @ai-sdk/* dependencies
- Add lightweight Quick Capture plugin
- Update docs to emphasize Clawdbot integration

Benefits:
- Smaller bundle (-200KB)
- No API keys in browser
- Consistent AI analysis via Clawdbot
- Better privacy

See: docs/CLAWDBOT_AI_MIGRATION.md"

git push origin develop
```

## Rollback Plan

If you need to revert:

```bash
# 1. Go back to backup branch
git checkout backup/before-ai-migration

# 2. Or reset to specific commit
git log --oneline | grep "before"  # find the commit
git reset --hard <commit-sha>

# 3. Restore submodule
git submodule update --init --recursive
```

## FAQ

### Q: Will existing brain dumps be lost?
**A**: No. The Quick Capture plugin uses the same markdown structure. Old brain dumps in the markdown will remain intact.

### Q: Can users still do immediate AI analysis?
**A**: Not in the SPA. They need to ask Clawdbot explicitly: "@clawdbot process my brain dumps". Or wait for periodic processing (every 30 min).

### Q: What if Clawdbot is not installed?
**A**: Quick Capture still works. Brain dumps accumulate in markdown. Users can review them manually or install Clawdbot later.

### Q: What about offline usage?
**A**: Quick Capture works offline (just appends text). AI analysis requires Clawdbot which needs network access.

### Q: Can we support both (hybrid)?
**A**: Yes, but not recommended. It adds complexity. Better to commit to Clawdbot-first architecture.

## Success Checklist

- [ ] AI Assistant submodule removed
- [ ] @ai-sdk dependencies removed from package.json
- [ ] Quick Capture plugin created and working
- [ ] Plugin manifest updated
- [ ] README updated (removed OpenAI/Azure sections)
- [ ] SPECIFICATION updated
- [ ] Clawdbot skill updated with brain dump workflow
- [ ] Environment variables cleaned up
- [ ] Build successful (smaller bundle)
- [ ] Tests pass
- [ ] Deployed to staging
- [ ] Clawdbot integration tested end-to-end
- [ ] User documentation updated

## Next Steps After Migration

1. **Update ClawdHub listing** - Emphasize brain dump processing workflow
2. **Create video tutorial** - Show Quick Capture → Clawdbot workflow
3. **Add Clawdbot status indicator** - Show last analysis time in UI (Phase 2 feature)
4. **Gather feedback** - Monitor user adoption of Quick Capture
5. **Optimize Clawdbot schedule** - Tune polling frequency based on usage patterns

## Timeline Estimate

- **Phase 1-2** (Remove submodule): 30 minutes
- **Phase 3-4** (Clean dependencies): 15 minutes
- **Phase 5** (Build Quick Capture): 2-3 hours
- **Phase 6-7** (Update docs): 1 hour
- **Phase 8-9** (Test): 1 hour
- **Phase 10** (Deploy): 30 minutes

**Total**: ~5-6 hours for complete migration

## Related Docs

- [Clawdbot-First AI Architecture Spec](../specs/features/clawdbot-first-ai.md)
- [Clawdbot Integration Spec](../specs/integrations/clawdbot.md)
- [Clawdbot Skill File](../skills/todolist-md-clawdbot/SKILL.md)
