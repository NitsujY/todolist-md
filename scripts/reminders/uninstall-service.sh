#!/bin/bash

# uninstall-service.sh
# Removes the todolist-md reminders sync service

PLIST_NAME="com.todolistmd.reminders-sync.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "Uninstalling Reminders Sync Service..."

if [ -f "$PLIST_DEST" ]; then
    launchctl unload "$PLIST_DEST"
    rm "$PLIST_DEST"
    echo "  Service unloaded and plist removed."
else
    echo "  Service plist not found at $PLIST_DEST"
fi

echo "Done."
