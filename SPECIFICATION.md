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

### 3.3 Google Drive Adapter (`google`)
- **Auth**: OAuth 2.0 with `https://www.googleapis.com/auth/drive` scope.
- **Persistence**:
    - Access Token is cached in `localStorage` with expiration handling to minimize re-auth prompts.
    - `google-drive-config` stores Client ID and API Key.
- **Behavior**:
    - Lists `.md` and `.markdown` files in the configured root folder (or root of Drive).
    - Supports switching accounts.

## 4. Feature Specifications

### 4.1 Task Management
- **Adding**:
    - "Add First Task" button when list is empty.
    - `Enter` key creates a new task below the current one.
- **Editing**:
    - Click text to edit.
    - `Cmd+Enter` / `Ctrl+Enter` to add/edit description.
    - `Escape` to cancel edit.
    - `Backspace` on empty task deletes it.
- **Reordering**:
    - Drag and drop via handle.
    - Supports reordering within the same level and nesting (drag right to nest).

### 4.2 Appearance & Settings
- **Themes**: Light, Dark, Auto (system preference).
- **Fonts**:
    - Options: System UI, Inter, Roboto Mono, Fira Code.
    - Implementation: CSS variables and `data-font` attribute on `<html>`.
    - **Constraint**: Font selection must persist across reloads.
- **Compact Mode**: Reduces padding and margins.
- **Font Size**: Adjustable (Small, Normal, Large, XL).
    - **Constraint**: Checkboxes and drag handles must align vertically with the first line of text regardless of font size.

### 4.3 Plugin System
- **Architecture**: Plugins are registered in `pluginEngine.ts`.
- **Capabilities**:
    - `onTaskRender`: Render custom UI next to tasks.
    - `transformMarkdown`: Modify markdown before parsing (hooks).
    - `renderHeaderButton`: Add buttons to the main toolbar.
- **Built-in Plugins**:
    - `ThemePlugin`: Manages theme switching.
    - `FontPlugin`: Manages font switching.
    - `DueDatePlugin`: Highlights due dates.
    - `FocusModePlugin`: Dim other tasks when focusing on one.
    - `AutoCleanupPlugin`: Archives completed tasks.

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
