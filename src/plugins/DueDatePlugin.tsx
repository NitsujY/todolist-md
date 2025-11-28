
import type { Plugin, PluginAPI } from './pluginEngine';

export class DueDatePlugin implements Plugin {
  name = 'DueDate';

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onInit(_api: PluginAPI) {
    // No actions needed for now
  }

  onTaskRender(task: { text: string }) {
    // Parse due date format: due:YYYY-MM-DD or @due(YYYY-MM-DD)
    // Let's support a simple "due:2023-12-31" format
    const match = task.text.match(/due:(\d{4}-\d{2}-\d{2})/);
    
    if (match) {
      const dateStr = match[1];
      const date = new Date(dateStr);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const isOverdue = date < today;
      const isToday = date.toDateString() === today.toDateString();
      
      let colorClass = 'bg-base-200 text-base-content/70';
      if (isOverdue) colorClass = 'bg-error/10 text-error';
      if (isToday) colorClass = 'bg-warning/10 text-warning';

      return (
        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${colorClass} flex items-center gap-1`}>
          <span>📅</span>
          {dateStr}
        </span>
      );
    }
    return null;
  }
}
