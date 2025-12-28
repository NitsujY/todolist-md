# macOS Reminders Sync for todolist-md

This folder contains tools to synchronize your Markdown todo lists with Apple Reminders on macOS. This allows you to use Siri, your iPhone, or your Watch to check off items, and have them sync back to your Markdown files.

## Prerequisites

- macOS (This feature relies on Apple's JXA automation)
- Node.js installed

## Quick Start (CLI)

The easiest way to sync is using the command line tool included in this project.

1.  **One-time Sync**:
    ```bash
    npm run reminders:sync -- --dir .
    ```

2.  **Watch Mode (Recommended)**:
    Keeps running and syncs changes every 60 seconds.
    ```bash
    npm run reminders:sync -- --dir . --watch
    ```

3.  **Configuration File (Unified)**:
    The tool now looks for a `todolist.config.json` in your project root. If it doesn't exist, it will be created automatically when you run the script without arguments.

    **Example `todolist.config.json`:**
    ```json
    {
      "plugins": {
        "reminders": {
          "mappings": [
            { "markdownFile": "work/project-x.md", "remindersList": "Project X" },
            { "markdownFile": "personal/groceries.md", "remindersList": "Shopping" }
          ],
          "ignore": ["archive/**"]
        }
      }
    }
    ```
    
    To use this config, simply run:
    ```bash
    npm run reminders:sync -- --watch
    ```
    (No arguments needed, it will find the config automatically)

## Background Service (Set and Forget)

If you want the sync to run automatically in the background without keeping a terminal window open, use the provided install script.

### 1. One-Click Install

Run this script from the root of the repository:

```bash
./scripts/reminders/install-service.sh
```

This will:
1.  Detect your current folder path.
2.  Create a launch agent configuration.
3.  Start the background service immediately.

### 2. One-Click Uninstall

To stop and remove the service:

```bash
./scripts/reminders/uninstall-service.sh
```

### 3. Verify it's working

Check the logs to see if it's running:

```bash
tail -f ~/Library/Logs/todolistmd-reminders-sync.out.log
```

## How it Works (Safe Sync Strategy)

To prevent data loss due to formatting differences (the "Translation Gap"), the sync engine uses a **Safe Sync** strategy by default:

1.  **Markdown is the Source of Truth for Content**:
    - If you rename a task in Markdown, it updates in Reminders.
    - If you rename a task in Reminders, **it does NOT update Markdown** by default. This protects your Markdown links and formatting from being stripped by Reminders.

2.  **Bi-directional Status**:
    - Checking off a task on your phone **WILL** update the Markdown file (`[ ]` -> `[x]`).

3.  **Bi-directional Creation/Deletion**:
    - Creating a new task on your phone adds it to the Markdown file.
    - Deleting a task in Markdown deletes it from your phone.

### Force Options

If you want to override this behavior, you can use force flags:

- `--force-push`: Forces Reminders titles to match Markdown (overwrites changes made on phone).
- `--force-pull`: Forces Markdown titles to match Reminders (RISKY: may lose Markdown formatting like links).

Example:
```bash
npm run reminders:sync -- --dir . --force-push
```
