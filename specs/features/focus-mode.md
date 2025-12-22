# Focus Mode (Zen Mode) Specification

## Overview
Focus Mode (also known as Zen Mode) provides a distraction-free environment for editing tasks. When activated, it isolates the current task, dims the background, and provides a focused interface for writing and time management.

## Requirements

### Activation
- **Trigger**: Users can enter Zen Mode by clicking the "Sparkles" icon on a task item.
- **Condition**: The FocusMode plugin must be enabled in the application settings.
- **State**: When activated, the application enters a "Zen" state where only the active task is visible.

### UI/UX Behavior
1.  **Isolation**:
    - The active task card expands to fill a significant portion of the screen (fixed position, centered).
    - A backdrop overlay (blurred/dimmed) covers the rest of the application.
    - All other task items are hidden or faded out.
    - The body scroll is disabled to prevent scrolling away from the focused task.

2.  **Task Editing**:
    - The task title input becomes larger (font size ~1.75rem).
    - The description area is automatically expanded and focused.
    - The description textarea has a minimum height (e.g., 150px) to encourage writing.
    - Markdown preview/write toggle is available for the description.

3.  **Toolbar (Zen Controls)**:
    - A floating toolbar appears at the top of the screen.
    - **Position**: Fixed/Absolute at the top, centered horizontally.
    - **Contents**:
        - **Word Count**: Real-time count of words in the task title and description.
        - **Read Time**: Estimated reading time based on word count.
        - **Timer**: A built-in Pomodoro-style timer (default 25m).
            - Start/Pause controls.
            - Reset control.
            - Editable duration.
        - **Complete Button**: A prominent button to mark the task as complete without leaving Zen Mode.
        - **Exit Button**: A clear "X" button to save changes and exit Zen Mode.

### Deactivation (Exiting)
- **Triggers**:
    - Clicking the "Exit" (X) button in the toolbar.
    - Pressing the `Escape` key.
    - (Optional) Clicking outside the modal (on the backdrop).
- **Behavior**:
    - The task card animates back to its original position in the list.
    - The backdrop fades out.
    - Other tasks become visible again.
    - Any changes to text or description are saved.
    - If the task text is empty upon exit, the task is deleted.

## Technical Implementation Details
- **CSS Classes**:
    - `body.focus-mode-active`: Applied to `<body>` when the plugin is enabled.
    - `.task-item.is-editing.zen-mode`: Applied to the specific task item being edited in Zen Mode.
- **Components**:
    - `ZenModeControls`: A React component rendered via Portal (or inline with fixed positioning) containing the toolbar logic.
