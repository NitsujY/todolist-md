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

2.  **Link tasks in the UI (Recommended)**

This sync mode is **linked-task only**:

- Enable the `RemindersLink` plugin in Settings.
- Use the per-task Link/Unlink buttons (or the header “Link all”) to add hidden markers.
- The CLI will only touch tasks with the marker.

3.  **Dry Run (Recommended First)**:

Prints what would change without writing to Reminders or Markdown.

```bash
npm run reminders:sync -- --dry-run --verbose --dir .
```

Dry run for a single file/list:

```bash
npm run reminders:sync -- --file texture/project-alpha.md --list "Project Alpha" --dry-run --verbose
```

4.  **Watch Mode (Recommended)**:
    Keeps running and syncs changes every 60 seconds.
    ```bash
    npm run reminders:sync -- --dir . --watch
    ```

5.  **Configuration File (Optional)**:
  The tool looks for a config file in your project root:
  - Preferred: `.todolist-md.config.json`
  - Legacy fallback: `todolist.config.json`

  **Example `.todolist-md.config.json`:**
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

    Dry run with config:
    ```bash
    npm run reminders:sync -- --dry-run --verbose
    ```

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

1.  **Linked tasks only** (fast path):

- Only tasks with a hidden marker are synced.
- The marker stores the Reminders UUID so the CLI doesn’t need to scan lists.

2.  **Markdown is the Source of Truth for Content**:

- Markdown task title syncs to Reminders title.
- Markdown task description syncs to Reminders body.
- Renaming in Reminders does not overwrite Markdown.

3.  **Bi-directional Status (Sticky)**:

- If either side is completed, both become completed.
- (This avoids “who changed last?” ambiguity without relying on timestamps.)

### What this mode does NOT do

- It does not import arbitrary reminders into Markdown.
- It does not scan whole lists.

If you need “import everything from Reminders”, that’s a different (scan-heavy) mode and is intentionally not the default.

### “Markdown → Reminders” (Your Main Use Case)

The default behavior already prioritizes Markdown as the source of truth for content (title + description/body).

Dry run (recommended first):
```bash
npm run reminders:sync -- --dry-run --verbose --dir .
```

Real run (writes to Reminders / Markdown as needed):
```bash
npm run reminders:sync -- --verbose --dir .
```

### If you see `spawnSync osascript ETIMEDOUT`

Shared/iCloud Reminders lists can intermittently stall. You can increase the JXA timeout:

```bash
TODOLIST_MD_JXA_TIMEOUT_MS=60000 npm run reminders:sync -- --config .todolist-md.config.json --verbose
```

Or for watch mode:

```bash
TODOLIST_MD_JXA_TIMEOUT_MS=120000 npm run reminders:sync -- --dir . --watch --verbose
```

### Dry Run With Watch Mode

Yes — `--dry-run` also works with `--watch` (it will loop and log what it would do, but won’t write changes):

```bash
npm run reminders:sync -- --watch --dry-run --verbose
```
