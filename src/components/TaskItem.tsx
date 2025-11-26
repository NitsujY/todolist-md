import { useState, useEffect } from 'react';
import { pluginRegistry } from '../plugins/pluginEngine';
import type { Task } from '../lib/MarkdownParser';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  showCompleted: boolean;
}

export function TaskItem({ task, onToggle, showCompleted }: TaskItemProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (task.completed && !showCompleted) {
      // Start exit animation
      const timer = setTimeout(() => {
        setIsAnimating(true);
        // Wait for animation to finish before hiding
        setTimeout(() => setIsVisible(false), 500); 
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Reset immediately if uncompleted or showCompleted is true
      // We use a timeout of 0 to avoid synchronous state updates during render
      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsAnimating(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [task.completed, showCompleted]);

  if (!isVisible) return null;

  return (
    <div 
      className={`
        group flex items-center gap-3 p-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out
        ${isAnimating ? 'opacity-0 -translate-y-4 max-h-0 overflow-hidden py-0 border-none' : 'opacity-100 max-h-24'}
      `}
    >
      <button 
        onClick={() => onToggle(task.id)}
        className={`flex-shrink-0 transition-colors p-1 rounded-full hover:bg-base-200 ${task.completed ? 'text-base-content/30' : 'text-base-content/50 hover:text-primary'}`}
      >
        {task.completed ? <div className="w-5 h-5 rounded-full border-2 border-current bg-current"></div> : <div className="w-5 h-5 rounded-full border-2 border-current"></div>}
      </button>
      
      <span 
        onClick={() => onToggle(task.id)}
        className={`flex-1 break-words text-lg cursor-pointer select-none ${task.completed ? 'line-through text-base-content/30' : 'text-base-content'}`}
      >
        {task.text}
      </span>
      
      {/* Plugin Extensions */}
      <div className="flex gap-2 empty:hidden">
        {pluginRegistry.renderTaskExtensions(task)}
      </div>
    </div>
  );
}
