# Task Management Specification

## Overview
The core functionality of the application is managing a hierarchical list of tasks using Markdown as the underlying storage format.

## Requirements

### Task Structure
- **Data Model**: Tasks are represented as Markdown list items.
    - `- [ ] Task text`: An incomplete task.
    - `- [x] Task text`: A completed task.
    - `## Section Header`: A section header (grouping tasks).
- **Hierarchy**: Tasks can be nested (indented) to create sub-tasks.
- **Metadata**:
    - **Tags**: `#tagname` within the text.
    - **Due Dates**: `due:YYYY-MM-DD` within the text.
    - **Description**: Additional text following the task line (often as blockquotes `>`).

### Task Item Interactions
1.  **View Mode**:
    - Displays the task text with Markdown rendering (links, bold, italic).
    - **Checkbox**: Toggles completion state.
    - **Tags**: Rendered as clickable pills.
    - **Links**: Rendered as clickable anchors (opening in new tab).
    - **Hover Actions**:
        - Drag handle (for reordering).
        - "Enter Zen Mode" button (Sparkles icon).
        - Copy button (copies task text to clipboard).
        - Expand/Collapse description chevron (if description exists).

2.  **Edit Mode**:
    - Activated by clicking the task text.
    - Displays a textarea for the task title.
    - **Action Bar** (visible when editing):
        - "Add Details": Opens/focuses the description editor.
        - "Due Date": Appends a due date template to the text.
    - **Keyboard Shortcuts**:
        - `Enter`: Save changes and create a new task below.
        - `Shift+Enter`: Add newline (if applicable).
        - `Cmd+Enter` / `Ctrl+Enter`: Toggle description editing.
        - `Escape`: Cancel editing (revert changes) or Exit Zen Mode.
        - `Backspace` (on empty task): Delete the task.

3.  **Description Editing**:
    - A separate textarea for the detailed description.
    - Supports Markdown.
    - Auto-resizes height based on content.
    - Can toggle between "Write" and "Preview" modes (especially in Zen Mode).

### Task Operations
- **Create**: Adding a new task adds a new line to the Markdown file.
- **Update**: Modifying text updates the specific line in the Markdown file.
- **Delete**: Removing a task removes the line (and potentially its children/description).
- **Reorder**: Drag-and-drop reorders lines in the file.
- **Toggle**: Changing the checkbox updates `[ ]` to `[x]`.

## Technical Implementation
- **Parser**: A custom Markdown parser (`MarkdownParser.ts`) converts raw text to `Task` objects and back.
- **State Management**: `useTodoStore` manages the list of tasks and syncs with the storage adapter.
