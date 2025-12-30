import type { ReactNode } from 'react';
import { Link2, Link2Off } from 'lucide-react';
import type { Plugin } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';
import {
  ensureRemindersFileMarker,
  getRemindersListNameFromFileMarker,
  hasRemindersFileMarker,
  linkAllTasksToRemindersInMarkdown,
  setRemindersLinkInMarkdown,
} from '../lib/MarkdownParser';
import { useTodoStore } from '../store/useTodoStore';

const inferListName = (markdown: string) => {
  const fromMarker = getRemindersListNameFromFileMarker(markdown);
  if (fromMarker && fromMarker.trim()) return fromMarker.trim();

  const { currentFile, isFolderMode } = useTodoStore.getState();
  if (!isFolderMode) return undefined;
  // Default: file name without extension.
  const base = currentFile.replace(/\.md$/i, '');
  return base.trim() || undefined;
};

export class RemindersLinkPlugin implements Plugin {
  name = 'RemindersLink';
  defaultEnabled = false;

  renderTaskActionButton(task: Task): ReactNode {
    if (task.type !== 'task') return null;

    const isLinked = !!task.reminders;

    return (
      <button
        className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-primary"
        title={isLinked ? 'Unlink from Reminders' : 'Link to Reminders'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.stopPropagation();
          const { markdown, updateMarkdown } = useTodoStore.getState();
          const listName = inferListName(markdown);

          if (isLinked) {
            void updateMarkdown(setRemindersLinkInMarkdown(markdown, task.id, null));
            return;
          }

          // Mark as linked but with an empty UUID; the CLI sync will create and fill the UUID.
          let next = ensureRemindersFileMarker(markdown, listName);
          next = setRemindersLinkInMarkdown(next, task.id, { list: listName, uuid: '' });
          void updateMarkdown(next);
        }}
      >
        {isLinked ? <Link2Off size={16} /> : <Link2 size={16} />}
      </button>
    );
  }

  renderHeaderButton(): ReactNode {
    return (
      <button
        className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
        title="Link all incomplete tasks to Reminders (creates hidden markers)"
        onClick={() => {
          const { markdown, tasks, updateMarkdown } = useTodoStore.getState();
          const listName = inferListName(markdown);

          const ids = tasks
            .filter((t) => t.type === 'task' && !t.completed && !t.reminders)
            .map((t) => t.id);

          if (ids.length === 0) return;

          let next = ensureRemindersFileMarker(markdown, listName);
          next = linkAllTasksToRemindersInMarkdown(next, ids, listName);
          void updateMarkdown(next);
        }}
      >
        <Link2 size={18} />
      </button>
    );
  }

  // Used by the sidebar indicator: if the current file has a reminders file marker,
  // we consider it "linked".
  static isCurrentFileLinked(markdown: string) {
    return hasRemindersFileMarker(markdown);
  }
}
