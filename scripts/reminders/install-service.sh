#!/bin/bash

# install-service.sh
# Installs the todolist-md reminders sync service to launchd

set -e

# 1. Check for Node.js
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed or not in PATH."
    exit 1
fi

NODE_PATH=$(command -v node)
REPO_PATH=$(pwd)
PLIST_NAME="com.todolistmd.reminders-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"
TEMPLATE_PATH="$REPO_PATH/scripts/reminders/com.todolistmd.reminders-sync.plist.template"

# 2. Check if we are in the right directory
if [ ! -f "$TEMPLATE_PATH" ]; then
    echo "Error: Could not find template file. Please run this script from the root of the repository."
    echo "Current directory: $REPO_PATH"
    exit 1
fi

echo "Installing Reminders Sync Service..."
echo "  Repo Path: $REPO_PATH"
echo "  Node Path: $NODE_PATH"

# 3. Create the plist file from template
# We use sed to replace the placeholders
# Note: We use | as delimiter for sed to avoid issues with / in paths

# Create a temporary file
TEMP_PLIST=$(mktemp)

cp "$TEMPLATE_PATH" "$TEMP_PLIST"

# Replace __REPO_PATH__
sed -i '' "s|__REPO_PATH__|$REPO_PATH|g" "$TEMP_PLIST"

# Replace __TODO_FOLDER__ with current dir (default behavior)
# You can change this if you want to sync a different folder
sed -i '' "s|__TODO_FOLDER__|$REPO_PATH|g" "$TEMP_PLIST"

# Replace __HOME__
sed -i '' "s|__HOME__|$HOME|g" "$TEMP_PLIST"

# Replace /usr/local/bin/node or similar if needed, but the template uses npm run which uses env
# The template uses: cd __REPO_PATH__ && npm run ...
# This relies on npm being in the path when launchd runs /bin/zsh -lc
# This is usually fine for zsh users.

# 4. Install the plist
mv "$TEMP_PLIST" "$PLIST_DEST"

echo "  Created: $PLIST_DEST"

# 5. Load the service
# Unload first just in case
launchctl unload "$PLIST_DEST" 2>/dev/null || true
launchctl load "$PLIST_DEST"

echo "Service installed and started!"
echo "Logs are available at:"
echo "  $HOME/Library/Logs/todolistmd-reminders-sync.out.log"
echo "  $HOME/Library/Logs/todolistmd-reminders-sync.err.log"
