# Application Specification

This document serves as the source of truth for the `todolist-md` application. It defines the core features, behaviors, and technical constraints that must be preserved during development.

## 1. Core Philosophy
- **Markdown-First**: The application state is derived primarily from a Markdown string.
- **Serverless/Static**: The app runs entirely in the browser as a SPA.
- **Privacy-Focused**: Data is stored locally or in the user's own cloud storage (Google Drive).

## 2. Data Model & Parsing
The application uses `unified`, `remark-parse`, and `remark-gfm` to parse Markdown.

### 2.1 Task Parsing Rules
- **Task Item**: A list item with a checkbox `-[ ]` or `-[x]`.
- **Completion**: `[x]` (case-insensitive) denotes a completed task.
- **Text**: The content following the checkbox. Supports standard Markdown (bold, italic, links).
- **Tags**: Words starting with `#` (e.g., `#urgent`) are parsed as tags. Escaped hashes `\#` are ignored.
- **Due Dates**: The pattern `due:YYYY-MM-DD` is parsed as a due date.
- **Descriptions**: A blockquote (`>`) immediately following a task list item is treated as the task's description.
    - **Raw Markdown Requirement**: The description must be stored and edited as raw markdown. When a user edits a description, the application must present the raw markdown text (e.g., `**bold**`, `- item`) without escaping characters (like `\-` or `&#x20;`). The parser must extract the raw text content from the blockquote nodes to ensure fidelity.
- **Headers**: Markdown headers (`#`, `##`, etc.) act as section dividers.

### 2.2 Nested Tasks
- Indented list items are treated as subtasks.
- **Behavior**: Dragging a parent task moves all its children.
- **Depth**: Visual indentation corresponds to the list nesting level.

## 3. Storage Adapters
The app uses the `StorageProvider` interface to support multiple backends.

### 3.1 Local Storage Adapter (`local`)
- **Persistence**: Uses browser `localStorage`.
- **Key**: `todo-markdown` (default).
- **Behavior**: Single file mode only.

### 3.2 File System Adapter (`fs`)
- **API**: Uses the File System Access API (Chromium browsers).
- **Modes**:
    - **Single File**: Opens and edits one `.md` file.
    - **Folder**: Opens a directory, listing all `.md` files.
- **Permissions**: Must request read/write permission on every session restore (browser security constraint).
- **Renaming**: Handles case-insensitive file systems (e.g., macOS/Windows) by using a temporary file strategy when renaming files where only the case changes (e.g., `todo.md` -> `Todo.md`).

### 3.3 Google Drive Adapter (`google`)
- **Auth**: OAuth 2.0 with `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.install`, and `https://www.googleapis.com/auth/userinfo.email` scopes.
- **Persistence**:
    - Access Token is cached in `localStorage` with expiration handling.
    - User Email is cached to provide `login_hint` for smoother re-authentication.
    - `google-drive-config` stores Client ID and API Key.
- **File Listing Strategy**:
    - Uses Google Picker API for folder selection to ensure reliable ID retrieval.
    - Fetches *all* non-trashed files in the selected folder and filters for Markdown (`.md`, `.markdown`, `text/markdown`) in-memory to avoid API query inconsistencies.
    - Explicitly sets `gapi.client` token to ensure authenticated requests for private files.

## 4. Feature Specifications

Detailed feature specifications are maintained in the `specs/` directory.

- **[Task Management](specs/features/task-management.md)**: Core task creation, editing, and organization.
- **[Focus Mode (Zen Mode)](specs/features/focus-mode.md)**: Distraction-free editing experience.
- **[TaskItem UI](specs/ui/task-item.spec.md)**: Detailed UI states and interactions for the task component.

### 4.1 Appearance & Settings
- **Themes**: Light, Dark, Auto (system preference).
- **Fonts**:
    - Options: System UI, Inter, Roboto Mono, Fira Code.
    - Implementation: CSS variables and `data-font` attribute on `<html>`.
    - **Constraint**: Font selection must persist across reloads.
- **Compact Mode**: Reduces padding and margins.
- **Font Size**: Adjustable (Small, Normal, Large, XL).
    - **Constraint**: Checkboxes and drag handles must align vertically with the first line of text regardless of font size.

### 4.2 Plugin System
- **Architecture**: Plugins are registered via a manifest in `src/plugins/pluginManifest.ts` and executed through `pluginEngine.ts`.
- **Capabilities**:
    - `onTaskRender`: Render custom UI next to tasks.
    - `transformMarkdown`: Modify markdown before parsing (hooks).
    - `renderHeaderButton`: Add buttons to the main toolbar.
    - `renderSettings`: Render custom configuration UI in the Settings modal.
    - `onTaskComplete`: Hook triggered when a task is marked as done.
    - `renderDashboard`: Render background controllers or UI elements (e.g., for auto-refresh).
- **Built-in Plugins**:
    - `ThemePlugin`: Manages theme switching.
    - `FontPlugin`: Manages font switching.
    - `DueDatePlugin`: Highlights due dates.
    - `FocusModePlugin`: See [Focus Mode Spec](specs/features/focus-mode.md).
    - `AutoCleanupPlugin`: Archives completed tasks older than X days (configurable).
    - `AutoRefreshPlugin`: Periodically reloads the list (configurable interval).
        - **Constraint**: Must pause/skip refresh if the user is currently editing a task (input focused) to prevent data loss or UI disruption.
    - `SoundEffectsPlugin`: Plays sounds on task completion.
    - `GamifyPlugin`: (Experimental) XP and leveling system.
    - `AIAssistantPlugin`: (Submodule) AI features including Voice Mode and Smart Tags. Source: `https://github.com/NitsujY/todolist-ai-assistant.git`.

## 5. Technical Constraints & Rules
1.  **No Database**: Do not introduce a backend database. All state must be reconstructible from Markdown files.
2.  **Vite Config**: The `__APP_VERSION__` global is defined in `vite.config.ts` from `package.json`.
3.  **Tailwind**: Use Tailwind utility classes for styling. Avoid custom CSS unless necessary for complex animations or specific font overrides.
4.  **State Management**: Use `zustand` for global state.
5.  **Error Handling**:
    - Google Drive API failures should alert the user or log to console, not crash the app.
    - File System permission denials should be handled gracefully (show "Grant Permission" UI).

## 6. File Structure
- `src/adapters/`: Storage implementations.
- `src/lib/MarkdownParser.ts`: Core parsing logic. **Critical File**.
- `src/plugins/`: Plugin definitions.
- `src/store/`: Zustand store (`useTodoStore.ts`).

---
*This file was generated to ensure AI assistants maintain consistency with the established architecture and feature set.*
