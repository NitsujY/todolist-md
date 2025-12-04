import type { Plugin, PluginAPI } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';
import { deleteTaskInMarkdown } from '../lib/MarkdownParser';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export class AutoCleanupPlugin implements Plugin {
  name = 'AutoCleanup';
  defaultEnabled = false;

  onInit(api: PluginAPI) {
    api.registerAction('cleanup', () => this.cleanup());
  }

  getDaysThreshold(): number {
    const saved = localStorage.getItem('auto-cleanup-days');
    return saved ? parseInt(saved, 10) : 30;
  }

  async cleanup() {
    const store = useTodoStore.getState();
    const { tasks, markdown, updateMarkdown } = store;
    const now = new Date();
    const days = this.getDaysThreshold();
    const thresholdDate = new Date(now);
    thresholdDate.setDate(now.getDate() - days);

    const tasksToDelete: { id: string; line: number }[] = [];

    tasks.forEach(task => {
      if (task.completed) {
        const match = task.text.match(/@done\((\d{4}-\d{2}-\d{2})\)/);
        if (match) {
          const doneDate = new Date(match[1]);
          // Check if valid date
          if (!isNaN(doneDate.getTime()) && doneDate < thresholdDate) {
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
        title={`Clean up tasks older than ${this.getDaysThreshold()} days`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  renderSettings() {
    return <AutoCleanupSettings />;
  }
}

function AutoCleanupSettings() {
  const [days, setDays] = useState(() => {
    const saved = localStorage.getItem('auto-cleanup-days');
    return saved ? parseInt(saved, 10) : 30;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val > 0) {
      setDays(val);
      localStorage.setItem('auto-cleanup-days', val.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">Cleanup tasks older than (days)</span>
      <input 
        type="number" 
        value={days} 
        onChange={handleChange}
        className="input input-bordered input-sm w-20"
        min="1"
      />
    </div>
  );
}

