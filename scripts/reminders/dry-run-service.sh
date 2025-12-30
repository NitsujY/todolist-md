#!/bin/bash

# dry-run-service.sh
# Simulates the behavior of the reminders sync service without installing it

set -e

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH."
    exit 1
fi

NODE_PATH=$(command -v node)
REPO_PATH=$(pwd)

# 2. Check if we are in the right directory
if [ ! -f "$REPO_PATH/scripts/reminders/com.todolistmd.reminders-sync.plist.template" ]; then
    echo "Error: Could not find template file. Please run this script from the root of the repository."
    echo "Current directory: $REPO_PATH"
    exit 1
fi

PLIST_NAME="com.todolistmd.reminders-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

# Determine which config to use:
# - If the service is installed, use the installed plist (this is the real "default" config).
# - Otherwise, match install-service.sh defaults: sync the repo root (current dir).
SYNC_DIR="$REPO_PATH"

if [ -f "$PLIST_DEST" ]; then
    if command -v /usr/libexec/PlistBuddy &> /dev/null; then
        SERVICE_CMD=$(/usr/libexec/PlistBuddy -c 'Print :ProgramArguments:2' "$PLIST_DEST" 2>/dev/null || true)

        # Expected format (from template after install-service.sh replacement):
        # cd /path/to/repo && npm run reminders:sync -- --dir /path/to/todos
        if [[ -n "$SERVICE_CMD" ]]; then
            # Extract repo path from: cd <repo> &&
            if [[ "$SERVICE_CMD" =~ cd[[:space:]]+([^&]+)[[:space:]]*\&\& ]]; then
                REPO_PATH="${match[1]}"
                REPO_PATH="${REPO_PATH%% }"
            fi

            # Extract sync dir from: --dir <dir>
            if [[ "$SERVICE_CMD" =~ --dir[[:space:]]+([^[:space:]]+) ]]; then
                SYNC_DIR="${match[1]}"
            fi
        fi
    fi
fi

# 3. Simulate the reminders sync command
echo "Simulating reminders sync service..."
echo "  Repo Path: $REPO_PATH"
echo "  Node Path: $NODE_PATH"
echo "  Sync Directory: $SYNC_DIR"

echo "Running: (cd $REPO_PATH && npm run reminders:sync -- --dir $SYNC_DIR --verbose --dry-run)"
(cd "$REPO_PATH" && npm run reminders:sync -- --dir "$SYNC_DIR" --verbose --dry-run)

echo "Dry run completed successfully."
