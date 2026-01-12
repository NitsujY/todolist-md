import type { Plugin, PluginAPI } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';
import { deleteTaskInMarkdown } from '../lib/MarkdownParser';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';

export class AutoCleanupPlugin implements Plugin {
  name = 'AutoCleanup';
  defaultEnabled = false;

  private timerId: number | null = null;
  private readonly lastRunStorageKey = 'auto-cleanup-last-run';

  onInit(api: PluginAPI) {
    api.registerAction('cleanup', () => this.cleanup());
  }

  onEnable = () => {
    // Run soon after enabling, then periodically.
    // Keep this conservative: once per day maximum, and never while editing.
    this.stopScheduler();
    this.timerId = window.setInterval(() => {
      void this.cleanupIfDue();
    }, 60 * 60 * 1000); // hourly

    // Fire a near-immediate attempt.
    window.setTimeout(() => {
      void this.cleanupIfDue();
    }, 1500);
  };

  onDisable = () => {
    this.stopScheduler();
  };

  private stopScheduler() {
    if (this.timerId !== null) {
      window.clearInterval(this.timerId);
      this.timerId = null;
    }
  }

  private isUserEditingTask() {
    const active = document.activeElement;
    return !!(
      active &&
      (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') &&
      (active as Element).closest('.task-item')
    );
  }

  private isDueToRunToday() {
    const today = new Date().toISOString().slice(0, 10);
    const last = localStorage.getItem(this.lastRunStorageKey);
    return last !== today;
  }

  private markRanToday() {
    const today = new Date().toISOString().slice(0, 10);
    localStorage.setItem(this.lastRunStorageKey, today);
  }

  private async cleanupIfDue() {
    if (!this.isDueToRunToday()) return;
    if (this.isUserEditingTask()) return;

    // Only mark as ran if the cleanup attempt completes.
    await this.cleanup();
    this.markRanToday();
  }

  getDaysThreshold(): number {
    const saved = localStorage.getItem('auto-cleanup-days');
    return saved ? parseInt(saved, 10) : 30;
  }

  async cleanup() {
    const store = useTodoStore.getState();
    const { tasks, markdown, updateMarkdown } = store;
    if (!markdown || tasks.length === 0) return;
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

