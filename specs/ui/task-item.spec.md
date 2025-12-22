# TaskItem UI Component Specification

## Component: `TaskItem`

### Props
- `task`: The Task object (id, text, completed, description, etc.).
- `onToggle`: Callback to toggle completion.
- `onUpdate`: Callback to update text.
- `onUpdateDescription`: Callback to update description.
- `onDelete`: Callback to delete task.
- `isZenMode`: Boolean indicating if this specific task is in Zen Mode.

### States
1.  **Default (Idle)**
    - Shows checkbox, rendered markdown text.
    - Description is hidden or collapsed by default unless `showDescription` is toggled.
    - Hovering reveals action buttons (Drag, Zen, Copy).

2.  **Editing (Inline)**
    - Input/Textarea replaces the rendered text.
    - Focus is trapped within the input.
    - "Add Details" and "Due Date" buttons appear below the input.

3.  **Zen Mode (Maximized)**
    - **Trigger**: `isZenMode` prop is true AND `isEditing` is true.
    - **Appearance**:
        - Fixed position, high z-index.
        - Large font size.
        - Description always visible and expanded.
        - "Write/Preview" toggle visible for description.
    - **Behavior**:
        - "Exit" button (in toolbar) triggers the exit callback.
        - `Escape` key triggers exit.

### Visual Styles
- **Completed**: Text is struck-through, opacity reduced.
- **Dragging**: Opacity reduced (0.5), background slightly darker (`bg-base-200`).
- **Compact Mode**: Reduced padding and line height.

### Accessibility
- Inputs should auto-focus when entering edit mode.
- Keyboard navigation should be supported (Enter to save, Escape to cancel).
