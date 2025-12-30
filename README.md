# Serverless, Plugin-First Markdown Todo App

A Proof-of-Concept (PoC) for a Todo App that runs entirely as a static website (SPA) using Markdown as the data source. **This app is designed to work primarily with local files or remote markdown sources, giving you full control over your data without relying on a proprietary database.**

## Tech Stack

- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: Zustand
- **Markdown Parser**: Unified / Remark

## Architecture

- **Storage Adapter Pattern**: Supports swapping between Local Storage and Mock Cloud Storage.
- **Plugin System**: Allows extending the UI and Markdown transformation via plugins.
- **Markdown-First**: The source of truth is a Markdown string.

## Getting Started

1.  Install dependencies:
    ```bash
    npm install
    ```

2.  Run the development server:
    ```bash
    npm run dev
    ```

3.  Build for production:
    ```bash
    npm run build
    ```

## macOS Reminders Connector (CLI + Background Sync)

This repo includes a small CLI that can sync your Markdown lists into **macOS Reminders**.

How it maps:

- **Folder mode**: each `.md` file becomes a **Reminders list** (named after the filename).
- Each Markdown task (`- [ ]` / `- [x]`) becomes a reminder in that list.

### 1) Run once (to grant permissions)

```bash
npm install
npm run reminders:sync -- --dir /absolute/path/to/your/todo-folder
```

macOS will likely prompt for permission to allow `osascript`/Terminal to control Reminders.

### 2) Run as a background daemon (launchd)

1. Copy the template:

```bash
cp scripts/reminders/com.todolistmd.reminders-sync.plist.template \
    ~/Library/LaunchAgents/com.todolistmd.reminders-sync.plist
```

2. Edit `~/Library/LaunchAgents/com.todolistmd.reminders-sync.plist` and replace:

- `__REPO_PATH__` with your repo path (example: `/Users/you/Devel/todolist-md`)
- `__TODO_FOLDER__` with your markdown folder (example: `/Users/you/Todos`)
- `__HOME__` with your home directory path

3. Load the agent:

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.todolistmd.reminders-sync.plist 2>/dev/null || true
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.todolistmd.reminders-sync.plist
launchctl kickstart -k gui/$(id -u)/com.todolistmd.reminders-sync
```

To check logs:

- `~/Library/Logs/todolistmd-reminders-sync.out.log`
- `~/Library/Logs/todolistmd-reminders-sync.err.log`

### Notes / limitations

- This sync is **linked-task only** for speed and reliability.
    - In the UI, enable the `RemindersLink` plugin.
    - Use the Link/Unlink buttons (or “Link all”) to add hidden markers to the tasks you want synced.
    - The CLI only syncs tasks that have the marker.
- Content direction:
    - Markdown task **title** syncs to Reminders title.
    - Markdown task **description** (blockquote under a task) syncs to the Reminders reminder **body**.
- Completion is **bi-directional (sticky)**: if either side is completed, both become completed.
- The CLI stores the Reminders UUID in the hidden marker (no scanning/index file required).
- It only works with **real markdown files** on disk (File System / folder mode is ideal). LocalStorage-only lists aren’t directly accessible from a CLI.

## Submodule Note (AI Assistant)

The AI Assistant is a git submodule at `src/plugins/ai-assistant`. If you change it, you must push the submodule commit before pushing the parent repo submodule pointer (otherwise CI can fail with a missing ref).

## AI Assistant: OpenAI vs Azure OpenAI

This app is a static SPA. Any API key you provide (in Settings or via Vite env vars) is used from the browser.

- If you need to keep keys secret, use **Private Endpoint (Managed)** and proxy calls through a backend you control.

### Option A: Configure in the UI (recommended for quick testing)

1. Open the app.
2. Open **AI Settings** (gear icon).
3. In **Provider**, choose:
    - **OpenAI** (standard OpenAI API), or
    - **Azure OpenAI** (Microsoft Azure OpenAI).

For **OpenAI**:
- Enter your **API Key**
- Optional: set **Model** (default: `gpt-4.1-mini`)

For **Azure OpenAI**:
- **Azure Endpoint**: `https://<resource>.openai.azure.com`
- **API Version**: the Azure OpenAI API version you enabled (example: `2024-06-01`)
- **Deployment**: your deployment name in Azure OpenAI Studio
- **API Key**: your Azure OpenAI key

### Option B: Configure via `.env.local` (Vite)

Create `.env.local` in the project root:

```bash
# Standard OpenAI
VITE_OPENAI_API_KEY=sk-...
VITE_OPENAI_MODEL=gpt-4.1-mini

# Azure OpenAI
VITE_AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com
VITE_AZURE_OPENAI_API_VERSION=2024-06-01
VITE_AZURE_OPENAI_DEPLOYMENT=<your-deployment-name>
VITE_AZURE_OPENAI_API_KEY=<your-azure-openai-key>
```

Restart the dev server after changes:

```bash
npm run dev
```

### Which model “works best”?

It depends on your priorities (quality vs cost vs speed). For this app’s use cases (task breakdown, summarization, light assistant prompts):

- **Best default (cost/perf)**: `gpt-4.1-mini` or `gpt-4o-mini`
- **Best quality**: `gpt-4.1` or `gpt-4o`

On **Azure OpenAI**, you don’t pass a model name in requests here — you select a **deployment**, and that deployment is tied to a model/version.

## Features

- **Markdown-First**: Your data is just Markdown. Edit it as a list or as raw text.
- **Local File System Access**: Open and edit local files and folders directly from your browser (Chromium-based browsers).
- **Nested Lists**: Support for subtasks and hierarchical organization.
- **Drag & Drop**: Reorder tasks and subtasks intuitively. Moving a parent task moves all its children.
- **Undo/Redo**: Mistakes are fine with full history support.
- **Search**: Quickly find tasks across your list.
- **Expand/Collapse Details**: One-click expand/collapse of all task descriptions from the top toolbar.
- **Focus Mode**: Dim distractions and focus on one task at a time (via Plugin).
- **Google Drive Integration**: Open and edit Markdown files directly from your Google Drive.
- **Fast File Switching (SWR Cache)**: Recently opened files load instantly from cache, then refresh in the background.
- **Customizable UI**:
    - **Themes**: Light, Dark, and System preference.
    - **Compact Mode**: For when you want to see more.
    - **Font Size**: Adjustable text size.
- **Plugin System**: Extensible architecture (includes Due Date, Focus Mode, etc.) loaded via a manifest.
- **Brain Dump (AI Assistant)**: Voice-first capture from a persistent bottom bar; optional typed input with scrolling inside the editor.
- **Storage Options**:
    - **Local Storage**: Quick start, data stays in browser. Persists across reloads.
    - **File System**: Edit real files on your disk. Remembers your last folder/file and prompts to restore access on reload.
    - **Google Drive**: Sync with your Google Drive (requires API setup). Automatically reconnects on reload.

## Plugins

The app features a robust plugin system. You can enable/disable them in Settings.

Built-in plugins are registered via a manifest at `src/plugins/pluginManifest.ts`.

- **Theme Manager**: Switch between Light, Dark, and Auto themes.
- **Font Manager**: Choose your preferred font (System, Inter, Roboto Mono, Fira Code).
- **Due Date**: Add due dates to tasks using `due:YYYY-MM-DD` syntax.
- **Focus Mode**: Automatically enters a distraction-free "Zen Mode" when you start editing a task. The task expands to fill the screen, and everything else fades away.
- **Auto Cleanup**: Automatically removes completed tasks older than a configurable number of days (default: 30).
- **Auto Refresh**: Periodically reloads the list from storage (configurable interval) to keep in sync with external changes. Intelligently pauses while you are editing to prevent interruptions.
- **Sound Effects**: Adds satisfying sounds when completing tasks.
- **Gamification**: (Experimental) Earn XP and level up by completing tasks.

## Changelog

- 2025-12-08: Fix - Zen Mode toolbar reliably fades in on re-entry. Adjusted Focus Mode CSS to target portal-rendered controls and updated the fade animation to ensure it resets correctly when entering Zen Mode multiple times.

## Markdown Syntax Guide

The app parses standard Markdown to generate the task list. Here is how it works:

- **Tasks**: Use standard Markdown task lists.
    - `- [ ] Task to do` -> Open Task
    - `- [x] Completed task` -> Completed Task
- **Sections**: Use Markdown headings to create sections.
    - `# Section Name` or `## Section Name`
- **Descriptions**: Use blockquotes immediately after a task to add a description.
    - `> This is a note about the task`
- **Tags**: Use hash symbols to tag tasks.
    - `- [ ] Buy milk #groceries #urgent`
    - Use `\#` to escape a hash symbol if you don't want a tag (e.g. `\#1`).
