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
- **Focus Mode**: Dim distractions and focus on one task at a time (via Plugin).
- **Google Drive Integration**: Open and edit Markdown files directly from your Google Drive.
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
 - **Focus Mode**: Provides a distraction-free "Zen Mode" that you can enter explicitly for a task. Key behaviors:
        - Entry: Zen Mode must be requested explicitly (via the plugin UI or configured keyboard shortcut). It will not hijack the normal `Enter` key workflow for creating new tasks.
        - Description Auto-Expand: When Zen Mode is entered for a task, the task's description is automatically expanded and opened for editing so you can focus on long-form notes immediately.
        - Exit: Zen Mode stays active until you either press the `Escape` key or click the floating top-bar Close (X) button. Clicking elsewhere (even inside the expanded description or controls) will not close Zen Mode to avoid accidental exits while editing.
        - Description Toggle: The chevron expand/collapse button toggles the description visibility but does not exit Zen Mode. Use the Close button or `Escape` to leave.

    Floating Toolbar UX Note:
        - The toolbar for Zen Mode is rendered as a floating top bar (centered, elevated) so critical controls (timer, stats, Complete, and Close) are always within reach.
        - Pros: Keeps important controls visible, reduces context switching, and enables quick timer actions while editing.
        - Cons: It overlaps content and may obscure some page elements; it also uses portal rendering which can complicate focus/routing behavior. If you prefer, the toolbar can be converted to a sticky in-modal header (non-portal) or an inline left/right rail — I can implement either variant if you prefer that UX.
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
