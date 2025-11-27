import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import { pluginRegistry } from '../plugins/pluginEngine';
import type { Task } from '../lib/MarkdownParser';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate?: (id: string, newText: string) => Promise<string | undefined> | void;
  onAddNext?: (afterId: string) => void;
  onDelete?: (id: string) => void;
  showCompleted: boolean;
  autoFocus?: boolean;
}

export function TaskItem({ task, onToggle, onUpdate, onAddNext, onDelete, showCompleted, autoFocus }: TaskItemProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
  };

  useEffect(() => {
    if (autoFocus) {
      // Use timeout to avoid synchronous state update warning and ensure render cycle is complete
      const timer = setTimeout(() => setIsEditing(true), 0);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (isEditing) {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      } else if (headerInputRef.current) {
        headerInputRef.current.focus();
      }
    }
  }, [isEditing]);

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

  // Sync local state with prop when prop changes
  if (task.text !== editText && !isEditing) {
    setEditText(task.text);
  }

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow default behavior (newline)
        return;
      }
      e.preventDefault(); // Prevent newline
      
      let currentId = task.id;
      if (editText.trim() !== task.text) {
        const newId = await onUpdate?.(task.id, editText);
        if (newId) currentId = newId;
      }
      setIsEditing(false);
      onAddNext?.(currentId);
    } else if (e.key === 'Escape') {
      setIsEditing(false);
      setEditText(task.text);
    } else if (e.key === 'Backspace' && editText === '') {
      e.preventDefault();
      onDelete?.(task.id);
    }
  };

  const handleBlur = () => {
    if (editText.trim() === '') {
      onDelete?.(task.id);
    } else if (editText.trim() !== task.text) {
      onUpdate?.(task.id, editText);
    }
    setIsEditing(false);
  };

  // Helper to clean text for display (remove plugin syntax like due:YYYY-MM-DD)
  const getDisplayText = (text: string) => {
    return text.replace(/due:\d{4}-\d{2}-\d{2}/g, '').trim();
  };

  if (!isVisible) return null;

  if (task.type === 'header') {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        className={`
          group flex items-center gap-3 p-3 pt-6 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
        `}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>
        {isEditing ? (
          <input
            ref={headerInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className="flex-1 bg-transparent border-none outline-none text-xl font-bold text-base-content p-0"
          />
        ) : (
          <h2 
            onClick={() => setIsEditing(true)}
            className="text-xl font-bold text-base-content flex-1 cursor-text"
          >
            {getDisplayText(task.text)}
          </h2>
        )}
        <button 
          onClick={() => onAddNext?.(task.id)}
          className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary"
          title="Add task to section"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  if (task.type === 'empty') {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        onClick={() => setIsEditing(true)}
        className={`
          group flex items-center gap-3 p-2 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
        `}
      >
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            rows={1}
            className="flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal"
            autoFocus
          />
        ) : (
          <div className="h-4 flex-1 cursor-text"></div>
        )}
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      className={`
        group flex items-center gap-3 p-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out
        ${isAnimating ? 'opacity-0 -translate-y-4 max-h-0 overflow-hidden py-0 border-none' : 'opacity-100 max-h-24'}
        ${isDragging ? 'opacity-50 bg-base-200' : ''}
      `}
    >
      <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 transition-opacity">
        <GripVertical size={16} />
      </div>

      <button 
        onClick={() => onToggle(task.id)}
        className={`flex-shrink-0 transition-colors p-1 rounded-full hover:bg-base-200 ${task.completed ? 'text-base-content/30' : 'text-base-content/50 hover:text-primary'}`}
      >
        {task.completed ? <div className="w-5 h-5 rounded-full border-2 border-current bg-current"></div> : <div className="w-5 h-5 rounded-full border-2 border-current"></div>}
      </button>
      
      {isEditing ? (
        <textarea
          ref={inputRef}
          value={editText}
          onChange={(e) => {
            setEditText(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = e.target.scrollHeight + 'px';
          }}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          rows={1}
          className="flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal"
        />
      ) : (
        <div 
          onClick={() => setIsEditing(true)}
          className={`flex-1 break-words text-lg cursor-text select-none prose prose-sm max-w-none min-h-[1.5em] ${task.completed ? 'line-through text-base-content/30' : 'text-base-content'}`}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{ p: ({children}) => <span className="m-0 p-0">{children}</span> }}>
            {getDisplayText(task.text)}
          </ReactMarkdown>
        </div>
      )}
      
      {/* Plugin Extensions */}
      <div className="flex gap-2 empty:hidden">
        {pluginRegistry.renderTaskExtensions(task)}
      </div>
    </div>
  );
}
