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
- **Plugin System**: Extensible architecture (includes Due Date, Focus Mode, and Priority Highlighter plugins).
- **Storage Options**:
    - **Local Storage**: Quick start, data stays in browser. Persists across reloads.
    - **File System**: Edit real files on your disk. Remembers your last folder/file and prompts to restore access on reload.
    - **Google Drive**: Sync with your Google Drive (requires API setup). Automatically reconnects on reload.

## Plugins

The app features a robust plugin system. You can enable/disable them in Settings.

- **Theme Manager**: Switch between Light, Dark, and Auto themes.
- **Font Manager**: Choose your preferred font (System, Inter, Roboto Mono, Fira Code).
- **Due Date**: Add due dates to tasks using `due:YYYY-MM-DD` syntax.
- **Focus Mode**: Enter a distraction-free mode to focus on a single task.
- **Auto Cleanup**: Automatically removes completed tasks older than a configurable number of days (default: 30).
- **Auto Refresh**: Periodically reloads the list from storage (configurable interval) to keep in sync with external changes.
- **Sound Effects**: Adds satisfying sounds when completing tasks.
- **Gamification**: (Experimental) Earn XP and level up by completing tasks.

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
