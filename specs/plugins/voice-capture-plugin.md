# Voice Capture Plugin Specification

## Overview
A lightweight, standalone plugin that provides **voice-to-text capture** for brain dumps and task creation. This plugin has **no AI/LLM** components—it only converts speech to text using the browser's native SpeechRecognition API.

## Philosophy
- **Pure capture**: Voice → text, nothing more
- **No analysis**: No LLM, no task extraction, no processing
- **Markdown-first**: Output is plain text appended to markdown
- **Browser-native**: Uses Web Speech API (no external services)

## Features

### 1. Voice-to-Text Capture
- Start/stop recording with one tap
- Real-time transcript display
- Continuous recording with pause/resume
- Automatic punctuation (browser-dependent)
- Language selection (optional)

### 2. Output Modes

**Mode A: Brain Dump** (default)
```markdown
## Brain Dump
- [Voice note 2026-02-02 09:15] Need to deploy version two soon, auth bug is blocking
- [Voice note 2026-02-02 09:16] Remember to call client about the meeting tomorrow
```

**Mode B: Direct Task**
```markdown
- [ ] Deploy version two soon, auth bug is blocking [captured via voice]
```

**Mode C: Append to Current Section**
```markdown
## Work Tasks
- [ ] Fix auth bug
- [Voice note] Deploy v2 after auth is fixed
```

### 3. UI Components

**Bottom Button** (same position as old Brain Dump)
- Fixed position: bottom-center
- Icon: Microphone
- Badge: shows pending voice notes count

**Recording Overlay**
- Full-screen on mobile
- Bottom sheet on desktop
- Shows:
  - Real-time transcript
  - Recording indicator (pulsing mic)
  - Pause/Resume button
  - Finish button
  - Cancel button

**Settings Panel**
- Language selection
- Output mode (Brain Dump / Direct Task / Append)
- Default section name (e.g., "Brain Dump")
- Show timestamps (yes/no)

## Technical Implementation

### Browser API
Uses [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API):
- `SpeechRecognition` (or `webkitSpeechRecognition`)
- Supported: Chrome, Edge, Safari
- Not supported: Firefox (as of 2026)

### Code Structure
```
src/plugins/VoiceCapturePlugin/
├── VoiceCapturePlugin.tsx       # Main plugin export
├── components/
│   ├── VoiceButton.tsx          # Bottom button
│   ├── VoiceOverlay.tsx         # Recording UI
│   └── VoiceSettings.tsx        # Settings panel
├── hooks/
│   └── useSpeechRecognition.ts  # Speech API wrapper
└── utils/
    └── formatVoiceNote.ts       # Text formatting
```

### Plugin Interface
```typescript
export const VoiceCapturePlugin: Plugin = {
  name: 'Voice Capture',
  
  // Bottom button (always visible)
  renderGlobal: () => <VoiceButton />,
  
  // Settings panel
  renderSettings: () => <VoiceSettings />,
};
```

### Speech Recognition Hook
```typescript
export function useSpeechRecognition() {
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  
  const start = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    recognition.onresult = (event) => {
      let interim = '';
      let final = transcript;
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          final += text + ' ';
        } else {
          interim += text;
        }
      }
      
      setTranscript(final);
      setInterimTranscript(interim);
    };
    
    recognition.start();
    setIsRecording(true);
  };
  
  const stop = () => {
    // Implementation
  };
  
  return { isRecording, transcript, interimTranscript, start, stop };
}
```

## Output Format Examples

### Example 1: Brain Dump Mode (Default)
```markdown
## Brain Dump
<!-- Voice notes captured by Voice Capture plugin -->
<!-- Clawdbot will process these periodically -->

- [Voice 2026-02-02 09:15] Need to deploy version two soon
- [Voice 2026-02-02 09:16] Auth bug is blocking production
- [Voice 2026-02-02 09:17] Remember to call client tomorrow
```

### Example 2: Direct Task Mode
```markdown
## Tasks
- [ ] Deploy version two soon [voice capture]
- [ ] Fix auth bug blocking production [voice capture]
- [ ] Call client tomorrow [voice capture]
```

### Example 3: Append to Section
If user is viewing "## Work" section:
```markdown
## Work
- [ ] Existing task
- [Voice note 09:15] Need to deploy version two soon
```

## User Workflow

### Quick Brain Dump
```
1. User taps microphone button (bottom)
2. Overlay opens, auto-starts recording
3. User speaks: "Need to deploy v2 soon, auth bug blocking"
4. User taps "Finish"
5. Text appends to markdown:
   ## Brain Dump
   - [Voice 2026-02-02 09:15] Need to deploy v2 soon, auth bug blocking
6. Overlay closes
```

### Create Task Directly
```
1. User taps mic button
2. Overlay opens
3. User switches mode to "Direct Task" (button at top)
4. User speaks: "Fix the auth bug"
5. User taps "Finish"
6. Text appends as task:
   - [ ] Fix the auth bug [voice capture]
```

### Long Recording (Pause/Resume)
```
1. Start recording
2. Speak for a while
3. Tap "Pause" to think
4. Read transcript, verify
5. Tap "Resume" to continue
6. Tap "Finish" when done
```

## Settings Options

**Voice Capture Settings**:
- **Language**: en-US, en-GB, es-ES, fr-FR, etc.
- **Output Mode**: 
  - Brain Dump (default)
  - Direct Task
  - Append to Current Section
- **Timestamps**: Show / Hide
- **Auto-start on open**: Yes / No
- **Default section**: "Brain Dump" (customizable)

## Edge Cases & Limitations

### Browser Support
- ✅ **Chrome/Edge**: Full support
- ✅ **Safari**: Supported on iOS 14.5+, macOS 15+
- ❌ **Firefox**: Not supported (as of 2026)
- Fallback: Show "Voice capture not supported" message

### Network Dependency
- Speech recognition requires internet (browser sends audio to server)
- Offline: Show warning, disable voice button
- Alternative: User can type instead

### Accuracy
- Depends on:
  - Microphone quality
  - Background noise
  - Accent/dialect
  - Internet speed
- User can edit transcript before saving

### Privacy
- Audio is sent to browser vendor's speech service (Google for Chrome)
- No recording stored by plugin (immediate transcription only)
- Consider adding privacy notice in settings

## Integration with Clawdbot

### Voice Capture → Clawdbot Flow
```
1. User voice captures: "Deploy v2 soon"
2. Plugin appends to Brain Dump section
3. Clawdbot checks markdown (6hr interval or on change)
4. Clawdbot sees new brain dump
5. Clawdbot analyzes, creates structured task:
   - [ ] Deploy v2.0 to production #urgent due:2026-02-05
6. User reviews and accepts Clawdbot suggestion
```

### No Direct Integration Needed
- Voice Capture writes plain markdown
- Clawdbot reads markdown
- They don't need to communicate directly
- This keeps architecture clean

## Migration from Old Brain Dump

### What Changes
- ❌ Remove: LLM analysis in-app
- ❌ Remove: OpenAI/Azure API calls
- ❌ Remove: "Generate" button
- ✅ Keep: Voice recording UI
- ✅ Keep: Transcript display
- ✅ Keep: Bottom button position

### What Stays the Same
- Same bottom button location
- Same overlay style
- Same "capture then save" flow
- Users won't notice much difference (except no LLM)

### User-Facing Changes
- Old: "Tap Finish → LLM analyzes → show tasks"
- New: "Tap Finish → save to Brain Dump → Clawdbot analyzes later"

**Communication**:
- Show tooltip: "💡 Tip: Clawdbot will analyze this later"
- In settings: "Voice notes are saved to Brain Dump. Clawdbot processes them every 6 hours."

## Performance & Bundle Size

### Old AI Assistant Bundle
- Speech API: ~10 KB
- LLM client libraries: ~200 KB
- **Total**: ~210 KB

### New Voice Capture Plugin
- Speech API: ~10 KB
- No LLM dependencies
- **Total**: ~10 KB

**Savings**: ~200 KB (95% reduction)

## Testing Checklist

- [ ] Voice recording starts/stops correctly
- [ ] Real-time transcript displays
- [ ] Pause/resume works
- [ ] Finish appends to markdown correctly
- [ ] Different output modes work
- [ ] Settings persist across reloads
- [ ] Works on mobile (iOS Safari, Chrome)
- [ ] Works on desktop (Chrome, Edge, Safari)
- [ ] Graceful fallback when not supported
- [ ] No memory leaks (stop recording on unmount)
- [ ] Offline detection and warning

## Future Enhancements (Optional)

### Phase 2: Enhanced Features
- **Multi-language support**: Auto-detect language
- **Custom templates**: "Create task: [transcript]"
- **Keyboard shortcuts**: Space to start/stop
- **Dictation commands**: "New task: [text]", "New section: [name]"

### Phase 3: Advanced (if needed)
- **Local speech-to-text**: Use on-device models (no network)
- **Audio recording**: Save .wav files alongside transcript
- **Voice notes library**: Browse all past captures

## Related Docs

- [Clawdbot-First AI Architecture](../features/clawdbot-first-ai.md)
- [Clawdbot Integration Spec](../integrations/clawdbot.md)
- [Migration Guide](../../docs/CLAWDBOT_AI_MIGRATION.md)
