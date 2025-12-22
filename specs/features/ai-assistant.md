# AI Assistant Plugin Specification

## 1. Overview
The `AIAssistantPlugin` is a comprehensive suite of AI-powered features designed to enhance the task management experience. It operates as a single plugin container that manages multiple "AI Skills" or sub-features, allowing users to enable/disable specific capabilities.

## 2. Architecture

### 2.1 Plugin Structure
The plugin follows a modular design similar to `gamify-plugin`, located in `src/plugins/ai-assistant/`.

```
src/plugins/ai-assistant/
├── AIAssistantPlugin.tsx       # Main entry point, manages state & settings
├── config.ts                   # LLM Provider configuration
├── services/
│   ├── LLMService.ts           # Interface for LLM backends
│   ├── OpenAIAdapter.ts        # Direct connection to OpenAI
│   └── PrivateEndpointAdapter.ts # Connection to paid private service
├── features/
│   ├── VoiceMode/              # Voice UI implementation
│   ├── SmartTags/              # Auto-tagging logic
│   └── Chat/                   # Context-aware chat
└── components/                 # Shared UI components
```

### 2.2 LLM Backend Abstraction
To support multiple backends (Private Endpoint, OpenAI, Gemini, etc.), the plugin uses an Adapter pattern.

**Interface:**
```typescript
interface LLMProvider {
  id: string;
  name: string;
  generateText(prompt: string, context: Task[]): Promise<string>;
  streamText?(prompt: string): AsyncGenerator<string>;
}
```

**Recommended Library:**
- **Vercel AI SDK Core (`ai`)**: Lightweight, provider-agnostic library to handle streaming and provider switching easily.

## 3. Configuration & Settings
The plugin settings allow users to choose their "Intelligence Source":

1.  **Paid Service (Default)**:
    - Connects to a private endpoint.
    - Requires a `License Key` (for paid users).
    - Handles authentication and usage quotas.
2.  **Bring Your Own Key (BYOK)**:
    - Users can select OpenAI, Google Gemini, or Anthropic.
    - Requires the user's personal API Key.
    - Direct client-to-provider communication (no middleman).

### 3.1 Settings UX
- The AI plugin exposes a small gear button inside the app's Plugin Settings list.
- Clicking the gear opens a right-side slide-out settings panel (no nested modal).
- Settings are stored in `localStorage` under `ai-plugin-config`.

## 4. Sub-Features (Skills)

### 4.1 Voice Mode (Priority Feature)
A "Hands-Free" experience triggered by a button or command.
- **UI**: Replaces the standard list view with a simplified, high-contrast "Conversational UI".
- **Interaction**:
    - **Input**: Uses Web Speech API (free) or Whisper (via endpoint) for Speech-to-Text.
    - **Output**: Uses Web Speech API for Text-to-Speech responses.
- **Commands**: "Add task...", "Read my tasks", "What's due today?".
- **Visuals**: Audio visualizer or simple "Listening/Thinking/Speaking" state indicators.
- **Real-time Transcript**: While listening, display interim/final transcript so the user can see what will be written into notes.

### 4.2 Smart Tagger (Background)
- Analyzes new tasks and suggests or automatically applies tags (e.g., "Buy milk" -> `#personal`, "Fix bug" -> `#work`).
- **Trigger**: On task creation (debounced).

### 4.3 Task Breakdown
- Adds a "Magic Wand" button to complex tasks.
- Generates subtasks for a high-level goal (e.g., "Plan vacation" -> "Book flight", "Reserve hotel").

#### 4.3.1 Prompt Contract (MVP)
- Input: Current task text + optional task list context.
- Output: Plain text lines, one subtask per line (no numbering, no extra prose).

## 5. Technical Constraints
- **Privacy**: If using BYOK, keys must be stored in `localStorage` and never sent to the private endpoint.
- **Offline**: The plugin should gracefully disable features when offline.
- **Cost Control**: For the private endpoint, the client must handle 402/403 (Quota Exceeded/Unpaid) responses by prompting the user.

## 6. Implementation Plan
1.  **Scaffold**: Create the plugin structure and Settings UI.
2.  **LLM Service**: Implement the `LLMService` with a mock adapter.
3.  **Voice UI**: Implement the visual overlay and Web Speech integration.
4.  **Integration**: Connect Voice UI to LLM for intent parsing.
