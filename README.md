# Serverless, Plugin-First Markdown Todo App

A Proof-of-Concept (PoC) for a Todo App that runs entirely as a static website (SPA) using Markdown as the data source.

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

- **Task Management**: Add, toggle, and view tasks.
- **Markdown Editor**: Edit the raw Markdown directly.
- **Storage Switching**: Switch between Local Storage and a Mock Cloud adapter.
- **Plugin System**: Example "PriorityHighlighter" plugin included.
