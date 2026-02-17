# Serverless, Plugin-First Markdown Todo App

[![AI Agent Ready](https://img.shields.io/badge/AI%20Agent-ready-f97316?style=flat-square)](#bot-integration-external)
[![Markdown Todo](https://img.shields.io/badge/Markdown-GFM%20Task%20Lists-10b981?style=flat-square)](#features)
[![LLM Friendly](https://img.shields.io/badge/LLM-friendly-8b5cf6?style=flat-square)](#markdown-syntax-guide)

A **Markdown-first todo app** designed for humans *and* AI agents. Keep your tasks in plain Markdown files, and let external agents read/analyze/act on them.

## Why this works well with bots

**Your todos are just Markdown files** — which means:
- ✅ **Bots can read them** directly from your file system or Google Drive
- ✅ **Zero vendor lock-in** — it's just plain text with GFM task lists
- ✅ **AI-native format** — LLMs understand Markdown perfectly
- ✅ **Automation-ready** — external scripts, agents, and CLIs can parse and modify your tasks

> Key idea: this app keeps tasks in standard Markdown so automation can happen externally.

## Tech Stack

- **Framework**: React (Vite)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: Zustand
- **Markdown Parser**: Unified / Remark

## Architecture

- **Storage Adapter Pattern**: Supports swapping between Local Storage, File System, and Google Drive.
- **Plugin System**: Allows extending the UI and Markdown transformation via plugins.
- **Markdown-First**: The source of truth is a Markdown string.
- **Automation-ready**: External tools (like **Clawdbot**) can parse the same Markdown and act on tasks.

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

## Release / Deploy (GitHub Pages)

- Normal development happens on `develop`.
- Releasing is **just squash-merge `develop` → `main`**.
- Every push to `main` is treated as a **public release**:
    - GitHub Actions creates the next **patch** git tag `vX.Y.Z` and a GitHub Release.
    - The site is built and deployed to **GitHub Pages**.

### Required GitHub Secrets

Set these repository secrets (used at build time):

- `VITE_GOOGLE_CLIENT_ID`
- `VITE_GOOGLE_API_KEY`

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

## Google Drive Markdown Download/Upload Script

For local testing and automation, this repo includes a Node.js script to:

- authenticate the user through OAuth in terminal flow,
- find a Drive folder by **folder name** (or folder ID),
- download all Markdown files,
- save a per-file mapping manifest keyed by Drive `fileId`, and
- upload local Markdown changes back using `files.update` by `fileId`.

This avoids filename-only ambiguity and supports stable write-back even when tools like `gog` cannot do your exact file-ID update workflow.

### Setup

1. Ensure dependencies are installed:

```bash
npm install
```

2. Provide OAuth credentials in environment variables:

```bash
export GOOGLE_CLIENT_ID="your_client_id"
export GOOGLE_CLIENT_SECRET="your_client_secret"
```

### Test locally: download todos by folder name

```bash
npm run drive:md:download -- --folderName "todolists" --outDir ./outputs/drive-md
```

Output includes:

- downloaded markdown files in `./outputs/drive-md`
- mapping manifest `./outputs/drive-md/.drive-md-map.json`

### Test locally: upload local edits back by file ID

```bash
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json
```

Optional: create files that no longer exist remotely:

```bash
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json --createMissing
```

Direct script path (same behavior):

```bash
node skills/todolist-md-clawdbot/scripts/drive_markdown_sync.mjs download --folderName "todolists" --outDir ./outputs/drive-md
node skills/todolist-md-clawdbot/scripts/drive_markdown_sync.mjs upload --manifest ./outputs/drive-md/.drive-md-map.json
```

If you only download `skills/todolist-md-clawdbot`, run from that folder with its own `package.json`:

```bash
cd skills/todolist-md-clawdbot
npm install
npm run drive:md:download -- --folderName "todolists" --outDir ./outputs/drive-md
npm run drive:md:upload -- --manifest ./outputs/drive-md/.drive-md-map.json
```

## Bot integration (external)

### Install the Clawdbot skill (optional)
If you're running Clawdbot locally, you can install the skill folder directly:

```bash
clawdhub publish ./skills/todolist-md-clawdbot --slug todolist-md-clawdbot --name "todolist-md-clawdbot" --version 0.1.0
# then install it (on the target Clawdbot instance)
clawdhub install todolist-md-clawdbot
```

If you prefer not to publish, you can copy `skills/todolist-md-clawdbot/` into your Clawdbot workspace skills folder.

Because tasks live in Markdown, this project is a good fit for external automation.

Full test fixture (markers + conventions): `texture/bot-full-example.md`.

### Simplified skill workflow (2 stages)

Use one runner with only two stages:

1. `plan` — read changed Markdown files and emit `llm_request.json`
2. `write` — read approved suggestions and write inline under matching tasks

Local fixture test commands:

```bash
npm run skill:plan:fixture
npm run skill:write:fixture
```

Input fixture folder:

- `fixtures/todolist-md/input/drive_list.json`
- `fixtures/todolist-md/input/files/*.md`
- `fixtures/todolist-md/input/llm_suggestions_for_apply.json`

Expected output files:

- `outputs/todolist-md/llm_request.json` (from `plan`)
- `outputs/todolist-md/write/f1.md` and `outputs/todolist-md/write/f2.md` (from `write`)

Inline write behavior:

- No new markdown section is created.
- Suggestions are added as blockquote lines directly under a matched task line.
- Marker format: `> <!-- bot: suggested --> ...`

Reference expected fixtures:

- `fixtures/todolist-md/expected/plan.llm_request.json`
- `fixtures/todolist-md/expected/write_f1.md`
- `fixtures/todolist-md/expected/write_f2.md`

### What “Clawdbot-friendly” means
- A Clawdbot skill can **read** your todo markdown files on a schedule.
- It can **summarize**, **prioritize**, and propose **next actions**.
- For tasks that match known playbooks (e.g., create PR, run CI, update docs), Clawdbot can **execute** them with confirmation.

### Suggested repository SEO keywords
- bot, agent, markdown todo, llm-friendly, automation

### Spec requirements for Clawdbot automation
- Keep todos as **standard GFM task lists** (`- [ ]` / `- [x]`).
- Use `#tags` and `due:YYYY-MM-DD` consistently (already supported by the parser).
- Prefer storing todos in **real files** (File System / Google Drive) so Clawdbot can access them out-of-browser.

## Features

- **Markdown-First**: Your data is just Markdown. Edit it as a list or as raw text.
- **Local File System Access**: Open and edit local files and folders directly from your browser (Chromium-based browsers).
- **Nested Lists**: Support for subtasks and hierarchical organization.
- **Drag & Drop**: Reorder tasks and subtasks intuitively. Moving a parent task moves all its children.
- **Undo/Redo**: Mistakes are fine with full history support.
- **Search**: Quickly find tasks across your list.
- **Expand/Collapse Details**: One-click expand/collapse of all task descriptions from the top toolbar.
- **Bot Questions**: Tasks with bot questions show a bot indicator; questions open an inline answer box and can be dismissed.
- **Skill Marker Compatibility**: Supports inline `<!-- bot: question -->`, `<!-- bot: suggested -->`, `<!-- bot: digest -->`, and `<!-- bot: note -->` markers in task blockquotes.
- **Focus Mode**: Dim distractions and focus on one task at a time (via Plugin).
- **Google Drive Integration**: Open and edit Markdown files directly from your Google Drive.
- **Fast File Switching (SWR Cache)**: Recently opened files load instantly from cache, then refresh in the background.
- **Customizable UI**:
    - **Themes**: Light, Dark, and System preference.
    - **Compact Mode**: For when you want to see more.
    - **Font Size**: Adjustable text size.
- **Plugin System**: Extensible architecture (includes Due Date, Focus Mode, etc.) loaded via a manifest.
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
- **Bot Markers in descriptions**:
    - `> <!-- bot: question --> Which CI job is failing?`
    - `> <!-- bot: note --> Keep this line-stable for IDs`
- **Tags**: Use hash symbols to tag tasks.
    - `- [ ] Buy milk #groceries #urgent`
    - Use `\#` to escape a hash symbol if you don't want a tag (e.g. `\#1`).
