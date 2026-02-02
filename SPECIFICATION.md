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
        - **Navigation Sidebar**: In Folder mode, the app provides a left sidebar listing files.
            - Toggled via the burger (menu) button in the top navbar.
            - When collapsed, hovering the burger button reveals a temporary floating sidebar for quick file navigation; it dismisses on mouse leave.
- **Permissions**: Must request read/write permission on every session restore (browser security constraint).
- **Renaming**: Handles case-insensitive file systems (e.g., macOS/Windows) by using a temporary file strategy when renaming files where only the case changes (e.g., `todo.md` -> `Todo.md`).

### 3.3 Google Drive Adapter (`google`)
- **Auth**: OAuth 2.0 with `https://www.googleapis.com/auth/drive.file` scope.
- **Auth UX**:
    - The app should avoid triggering OAuth popups from background operations (e.g., file switching, auto-refresh).
    - If the cached token is missing/expired, the UI should present an explicit **Connect** action to re-authenticate.
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
- **[Bot Integration](specs/integrations/clawdbot.md)**: External bot processing via Clawdbot skill or similar (no in-app AI).
- **[TaskItem UI](specs/ui/task-item.spec.md)**: Detailed UI states and interactions for the task component.

### 4.x Bot Integration (AI Agent Automation)

**Status**: First-class feature (see `specs/integrations/clawdbot.md` and `skills/todolist-md-clawdbot/`)

This app is designed to be **AI agent-friendly**. Because the data format is plain Markdown with GFM task lists, external agents (including Clawdbot) can:

1. **Read** todo files periodically from File System or Google Drive
2. **Analyze** tasks to identify:
   - Overdue items
   - Blocked tasks (missing info)
   - Quick wins (small, high-impact tasks)
   - Top 3 recommended next actions
3. **Execute** well-defined tasks autonomously (with user confirmation)

#### Requirements for Bot Compatibility

**MUST:**
- Tasks use GFM checkbox syntax: `- [ ]` (open) and `- [x]` (completed)
- Tags follow the `#tagname` convention
- Due dates use `due:YYYY-MM-DD` format
- Descriptions are blockquotes (`>`) immediately following a task
- Storage mode is **File System** or **Google Drive** (not LocalStorage-only, which is inaccessible outside the browser)

**SHOULD:**
- Keep task titles concise and action-oriented (e.g., "Deploy v2.0 to production" not "Maybe we should think about deployment")
- Use tags consistently for categorization (`#frontend`, `#backend`, `#urgent`)
- Add context in descriptions for complex tasks

**MAY:**
- Use additional metadata in descriptions (e.g., `owner:@username`, `depends-on:#123`)
- Link to external resources (GitHub issues, PRs, docs)

#### Safety Model

- **Read-only by default**: Clawdbot analyzes and suggests without modifying files
- **Write-back requires confirmation**: Any operation that modifies tasks (mark complete, add subtasks, reorder) must be explicitly confirmed by the user
- **Audit trail**: All Clawdbot actions should be logged (in the skill's context)

#### Example Agent Workflows

**Daily digest:**
```
User: @clawdbot check my todos
Clawdbot: You have 2 overdue tasks and 12 open. Top priority:
  1. [Deploy v2.0 to production] - due today, #backend
  2. [Update API docs] - due tomorrow, #docs
  3. [Fix auth bug] - no due date, #urgent
```

**Task breakdown:**
```
User: @clawdbot break down "Build new landing page"
Clawdbot: I'll add these subtasks (confirm?):
  - [ ] Design mockup in Figma
  - [ ] HTML structure
  - [ ] CSS styling
  - [ ] Make responsive
  - [ ] Deploy to staging
```

**Autonomous execution:**
```
Task: - [ ] Create PR for bugfix #github
      > Fix null pointer in auth.ts line 42

Clawdbot: I found the bug. I can:
  1. Create branch 'fix/auth-null-pointer'
  2. Apply the fix
  3. Open PR with description
  Confirm?
```

### 4.y Optional External Connectors

This repo may include optional, external utilities (outside the SPA) that operate on Markdown files.

- **macOS Reminders sync**: A CLI (`npm run reminders:sync`) that reads Markdown files from disk and mirrors tasks into macOS Reminders lists.
    - This is intentionally **out-of-browser** and does not change the app's serverless/SPA-only constraint.

### 4.0 Global Details Toggle
- The top toolbar provides a single **Expand details / Collapse details** control.
- **Expand details** opens the description/details panels for all tasks that currently have a description.
- **Collapse details** closes all opened description/details panels.
- Users can still expand/collapse an individual task after the global action.

#### Header Controls UX (Clutter Control)

To keep the header usable (especially on small screens) and avoid an ever-growing row of icons as features/plugins grow:

- Keep **Search** and the frequently used **View controls** visible (sections collapse/expand, details expand/collapse, show/hide completed).
- Move all less-frequent actions into a single overflow (`...`) dropdown.

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
- **Architecture**: Plugins are registered via a manifest in `src/plugins/pluginManifest.ts` and executed through `pluginEngine.tsx`.
- **Capabilities**:
    - `onTaskRender`: Render custom UI next to tasks.
    - `transformMarkdown`: Modify markdown before parsing (hooks).
    - `renderHeaderButton`: Add buttons to the main toolbar.
    - `renderSettings`: Render custom configuration UI in the Settings modal.
    - `onTaskComplete`: Hook triggered when a task is marked as done.
    - `renderDashboard`: Render background controllers or UI elements (e.g., for auto-refresh).
    - `renderGlobal`: Render UI that must always be mounted (e.g., fixed overlays/bars).
- **Built-in Plugins**:
    - `ThemePlugin`: Manages theme switching.

## 5. Configuration System

The application uses a unified configuration strategy to support both the web application and external tools (like the macOS Reminders sync script).

### 5.1 Unified Config File
- **Path**: `.todolist-md.config.json` (located in the root of the data folder/storage).
- **Purpose**: Single source of truth for cross-device settings and tool configuration.
- **Structure**:
  ```json
  {
    "ui": {
      "fontSize": "normal",
      "compactMode": true,
      "theme": "auto"
    },
    "plugins": {
      "reminders": {
        "mappings": [
          { "file": "todo.md", "list": "Reminders" }
        ]
      }
    }
  }
  ```

### 5.2 Synchronization Strategy
- **Read-Modify-Write**: The `ConfigService` reads the latest config, merges local changes, and writes it back to prevent overwriting concurrent updates.
- **Safe Sync**: The web app only modifies the `ui` section, leaving `plugins` and other sections intact.
- **Persistence**:
    - **Load**: On app startup and storage switch, the config is loaded and applied to the store.
    - **Save**: Changing UI settings (Font Size, Compact Mode) triggers an immediate write to the config file.

### 5.3 Configuration Scopes

To ensure a seamless experience across devices while respecting device-specific constraints, configuration is divided into three scopes:

| Scope | Storage Location | Examples | Purpose |
| :--- | :--- | :--- | :--- |
| **Global (Synced)** | `.todolist.config.json` (in data root) | Theme, Font Size, Compact Mode, Sidebar State, Plugin Status (Enabled/Disabled) | User preferences that should follow the user across devices. |
| **Local (Per-Device)** | Browser `localStorage` | Active Storage Adapter (Local/FS/Drive), Last Opened File, Font Family (System/Inter/etc) | Device-specific state or bootstrap settings needed *before* loading the main config. |
| **Session (Ephemeral)** | React State / Memory | Search Query, Undo/Redo Stack, Scroll Position, UI Panel Sizes | Temporary state relevant only to the current active session. |

    - `FontPlugin`: Manages font switching.
    - `DueDatePlugin`: Highlights due dates.
    - `FocusModePlugin`: See [Focus Mode Spec](specs/features/focus-mode.md).
    - `AutoCleanupPlugin`: Archives completed tasks older than X days (configurable).
    - `AutoRefreshPlugin`: Periodically reloads the list (configurable interval).
        - **Constraint**: Must pause/skip refresh if the user is currently editing a task (input focused) to prevent data loss or UI disruption.
    - `SoundEffectsPlugin`: Plays sounds on task completion.
    - `GamifyPlugin`: (Experimental) XP and leveling system.

#### 4.2 (Removed) AI Features

**All AI/LLM features removed** - moved to external Clawdbot processing. See `docs/CLAWDBOT_AI_MIGRATION.md`.

3.  **Tailwind**: Use Tailwind utility classes for styling. Avoid custom CSS unless necessary for complex animations or specific font overrides.
4.  **State Management**: Use `zustand` for global state.
5.  **Error Handling**:
    - Google Drive API failures should alert the user or log to console, not crash the app.
    - File System permission denials should be handled gracefully (show "Grant Permission" UI).

6.  **Release Process (GitHub Pages)**:
    - Any push to `main` is treated as a **public release**.
    - The intended human workflow is: **squash merge `develop` → `main`**.
    - CI must create the next **patch** git tag `vX.Y.Z` (and a GitHub Release) and deploy the built `dist/` to GitHub Pages.

## 7. Performance & Concurrency

### 7.1 Fast Switching (Stale-While-Revalidate)
- When switching between markdown files, the app should render cached content immediately when available.
- The app should refresh the selected file in the background and update the UI only if the content changed.
- The app should avoid clobbering the UI while the user is actively editing a task (an input/textarea within a task item is focused).

### 7.2 Multi-Writer Conflict Handling
- In multi-device/multi-user scenarios (primarily Google Drive), the app must avoid silent overwrites.
- When supported by the storage adapter, writes should use a conditional update (e.g., ETag via `If-Match`).
- On conflict, the app should preserve the user's local state and reload the latest remote version, prompting via a simple alert.

## 6. File Structure
- `src/adapters/`: Storage implementations.
- `src/lib/MarkdownParser.ts`: Core parsing logic. **Critical File**.
- `src/plugins/`: Plugin definitions.
- `src/store/`: Zustand store (`useTodoStore.ts`).

---
*This file was generated to ensure AI assistants maintain consistency with the established architecture and feature set.*
