import type { Plugin, PluginAPI } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';
import { deleteTaskInMarkdown } from '../lib/MarkdownParser';
import { Trash2 } from 'lucide-react';

export class AutoCleanupPlugin implements Plugin {
  name = 'AutoCleanup';
  defaultEnabled = false;

  onInit(api: PluginAPI) {
    api.registerAction('cleanup', () => this.cleanup());
  }

  async cleanup() {
    const store = useTodoStore.getState();
    const { tasks, markdown, updateMarkdown } = store;
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(now.getDate() - 30);

    const tasksToDelete: { id: string; line: number }[] = [];

    tasks.forEach(task => {
      if (task.completed) {
        const match = task.text.match(/@done\((\d{4}-\d{2}-\d{2})\)/);
        if (match) {
          const doneDate = new Date(match[1]);
          // Check if valid date
          if (!isNaN(doneDate.getTime()) && doneDate < thirtyDaysAgo) {
            // Extract line number from ID
            const lineMatch = task.id.match(/^(\d+)-/);
            if (lineMatch) {
              tasksToDelete.push({
                id: task.id,
                line: parseInt(lineMatch[1], 10)
              });
            }
          }
        }
      }
    });

    if (tasksToDelete.length === 0) return;

    // Sort by line number descending to avoid invalidating IDs of earlier tasks
    tasksToDelete.sort((a, b) => b.line - a.line);

    let newMarkdown = markdown;
    for (const item of tasksToDelete) {
      // We need to be careful here. deleteTaskInMarkdown expects the ID to match.
      // Since we are deleting from bottom up, the line numbers of remaining tasks (which are above)
      // should not change in the markdown source relative to the start of the file.
      // However, deleteTaskInMarkdown re-parses the markdown.
      // If we delete line 100, the file becomes shorter.
      // Then we delete line 50. The content at line 50 is still at line 50.
      // So this should work.
      newMarkdown = deleteTaskInMarkdown(newMarkdown, item.id);
    }

    await updateMarkdown(newMarkdown);
  }

  renderHeaderButton() {
    return (
      <button 
        key="cleanup-btn"
        onClick={() => this.cleanup()} 
        className="btn btn-ghost btn-sm btn-square" 
        title="Clean up tasks older than 30 days"
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }
}
