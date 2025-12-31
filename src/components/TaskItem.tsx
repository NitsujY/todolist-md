import { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, ChevronDown, ChevronRight, Calendar, AlignLeft, Copy, Check, Link2 } from 'lucide-react';
import { pluginRegistry } from '../plugins/pluginEngine.tsx';
import type { TaskItemContext } from '../plugins/pluginEngine.tsx';
import type { Task } from '../lib/MarkdownParser';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate?: (id: string, newText: string) => Promise<string | undefined> | void;
  onUpdateDescription?: (id: string, description: string) => void;
  descriptionExpanded?: boolean;
  onDescriptionExpandedChange?: (taskId: string, expanded: boolean) => void;
  onAddNext?: (afterId: string) => void;
  onToggleSection?: (headerId: string) => void;
  sectionCollapsed?: boolean;
  onHeaderEditStart?: (headerId: string) => void;
  onDelete?: (id: string) => void;
  showCompleted: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
}

export function TaskItem({ task, onToggle, onUpdate, onUpdateDescription, descriptionExpanded, onDescriptionExpandedChange, onAddNext, onToggleSection, sectionCollapsed, onHeaderEditStart, onDelete, showCompleted, autoFocus, compact, fontSize = 'normal' }: TaskItemProps) {
  const [isVisible, setIsVisible] = useState(() => {
    if (task.completed && !showCompleted) return false;
    return true;
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(task.text);
  const [uncontrolledShowDescription, setUncontrolledShowDescription] = useState(false);
  const isShowDescriptionControlled = descriptionExpanded !== undefined;
  const showDescription = isShowDescriptionControlled ? descriptionExpanded : uncontrolledShowDescription;
  const setShowDescription = (value: boolean | ((prev: boolean) => boolean)) => {
    const nextValue = typeof value === 'function' ? value(showDescription) : value;
    if (isShowDescriptionControlled) {
      onDescriptionExpandedChange?.(task.id, nextValue);
    } else {
      setUncontrolledShowDescription(nextValue);
    }
  };
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [editDescription, setEditDescription] = useState(task.description || '');
  const [justCopied, setJustCopied] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const isRemindersLinked = !!task.reminders;

  // Generic per-task modes for plugins (e.g. Zen Mode)
  const [modes, setModes] = useState<Record<string, boolean>>({});
  const isModeEnabled = (modeId: string) => !!modes[modeId];
  const setModeEnabled = (modeId: string, enabled: boolean) => {
    setModes(prev => ({ ...prev, [modeId]: enabled }));
  };

  // Transient guard to prevent blur handlers from auto-closing while entering special modes
  const [autoCloseGuard, setAutoCloseGuard] = useState(false);
  const guardAutoClose = (ms: number = 200) => {
    setAutoCloseGuard(true);
    setTimeout(() => setAutoCloseGuard(false), ms);
  };

  // Auto-resize description textarea when opening edit mode
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
    }
  }, [isEditingDescription, isPreviewMode]);

  const { over } = useDndContext();
  const isOver = over?.id === task.id;

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
    marginLeft: `${(task.depth || 0) * 1.5}rem`,
  };

  const requestEdit = () => setIsEditing(true);

  const requestEditDescription = () => {
    setShowDescription(true);
    setIsEditingDescription(true);
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.focus();
        descriptionRef.current.style.height = 'auto';
        descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
      }
    }, 0);
  };

  // Render drop indicator line
  const DropIndicator = () => {
    if (!isOver || isDragging) return null;
    return (
      <div className="absolute left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none transform -translate-y-1/2 top-0 shadow-[0_0_4px_rgba(var(--p),0.5)]" />
    );
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

  // Exit helper that saves changes then clears states
  const requestExit = async () => {
    if (editText.trim() === '') {
      onDelete?.(task.id);
    } else if (editText.trim() !== task.text) {
      await onUpdate?.(task.id, editText);
    }
    if (editDescription !== (task.description || '')) {
      onUpdateDescription?.(task.id, editDescription);
    }
    setIsEditing(false);
    setIsEditingDescription(false);
    setShowDescription(false);
    setModes({});
  };

  const taskItemContext: TaskItemContext = {
    isEditing,
    isEditingDescription,
    showDescription,
    modes: {
      isModeEnabled,
      setModeEnabled,
    },
    descriptionView: {
      view: isPreviewMode ? 'preview' : 'write',
      setView: (view) => setIsPreviewMode(view === 'preview'),
    },
    controls: {
      requestEdit,
      requestEditDescription,
      setShowDescription,
      requestExit: () => { void requestExit(); },
      guardAutoClose,
    },
  };

  const preventAutoClose = pluginRegistry.shouldPreventTaskEditAutoClose(task, taskItemContext);
  const shouldHideDescriptionToggle = pluginRegistry.shouldHideDescriptionToggle(task, taskItemContext);
  const taskItemPluginClassNames = pluginRegistry.getTaskItemClassNames(task, taskItemContext);

  useEffect(() => {
    if (task.completed && !showCompleted) {
      // If already hidden (initial render case handled by useState), don't animate
      if (!isVisible) return;

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

  useEffect(() => {
    if (task.text !== editText && !isEditing) {
      setEditText(task.text);
    }
  }, [task.text, editText, isEditing]);

  if (!isVisible) return null;

  const handleCopy = async () => {
    const checkbox = task.completed ? '- [x] ' : '- [ ] ';
    const text = task.text;
    // Indent description and add blockquote marker to match parser expectations
    const description = task.description ? `\n${task.description.split('\n').map(line => `  > ${line}`).join('\n')}` : '';
    const copyText = `${checkbox}${text}${description}`;
    
    try {
      await navigator.clipboard.writeText(copyText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // Cmd+Enter or Ctrl+Enter to toggle description editing
        e.preventDefault();
        setIsEditing(false);
        setShowDescription(true);
        setIsEditingDescription(true);
        // Wait for render
        setTimeout(() => {
          if (descriptionRef.current) {
            descriptionRef.current.focus();
          }
        }, 0);
        return;
      }
      
      if (e.shiftKey) {
        // Allow default behavior (newline)
        return;
      }
      
      e.preventDefault(); // Prevent newline (submit)
      
      let currentId = task.id;
      if (editText.trim() !== task.text) {
        const newId = await onUpdate?.(task.id, editText);
        if (newId) currentId = newId;
      }
      setIsEditing(false);
      onAddNext?.(currentId);
    } else if (e.key === 'Escape') {
      if (preventAutoClose) {
        e.preventDefault();
        await requestExit();
        return;
      }
      {
        setIsEditing(false);
        setEditText(task.text);
      }
    } else if (e.key === 'Backspace' && editText === '') {
      e.preventDefault();
      onDelete?.(task.id);
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditingDescription(false);
      setEditDescription(task.description || '');
    }
  };

  const handleDescriptionBlur = (e: React.FocusEvent) => {
    if (autoCloseGuard) return;
    // Check if focus is moving to the title input
    if (e.relatedTarget && (e.relatedTarget === inputRef.current || e.relatedTarget === headerInputRef.current)) {
      return;
    }

    // If focus is moving to any element inside the Zen Mode controls or inside the current task element,
    // do not treat it as a blur that should close editing while in Zen Mode. This prevents clicks below
    // the description (e.g., toolbar controls) from closing the modal.
    if (e.relatedTarget instanceof Element) {
      if (e.relatedTarget.closest('.zen-controls')) return;
      // If clicking somewhere inside THIS task's node (which includes the expanded description), keep editing
      const relatedTaskItem = e.relatedTarget.closest('.task-item');
      if (relatedTaskItem && relatedTaskItem.getAttribute('data-task-id') === task.id) return;
    }

    // If any plugin requests preventing auto-close, do not close on blur.
    if (preventAutoClose) {
      return;
    }

    if (editDescription !== (task.description || '')) {
      onUpdateDescription?.(task.id, editDescription);
    }
    setIsEditingDescription(false);
    // Also close title edit if we are leaving the task completely
    setIsEditing(false);
    setShowDescription(false);
  };

  const handleAddDueDate = () => {
    // Simple implementation: append due:YYYY-MM-DD if not present
    if (!editText.includes('due:')) {
      const today = new Date().toISOString().split('T')[0];
      setEditText(prev => `${prev} due:${today}`);
      // Keep editing focus
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleToggleDescriptionEdit = () => {
    // Keep title editing active for unified edit mode
    // setIsEditing(false); 
    setShowDescription(true);
    setIsEditingDescription(true);
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.focus();
      }
    }, 0);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (autoCloseGuard) return;
    // Check if focus is moving to the description input
    if (e.relatedTarget && e.relatedTarget === descriptionRef.current) {
      return;
    }

    // If focus is moving to any element inside the Zen Mode controls or staying within the task-item, ignore.
    if (e.relatedTarget instanceof Element) {
      if (e.relatedTarget.closest('.zen-controls')) return;
      const relatedTaskItem = e.relatedTarget.closest('.task-item');
      if (relatedTaskItem && relatedTaskItem.getAttribute('data-task-id') === task.id) return;
    }

    // If any plugin requests preventing auto-close, do not close on blur.
    if (preventAutoClose) {
      return;
    }

    if (editText.trim() === '') {
      onDelete?.(task.id);
    } else if (editText.trim() !== task.text) {
      onUpdate?.(task.id, editText);
    }
    setIsEditing(false);
    // Also close description edit if we are leaving
    setIsEditingDescription(false);
    setShowDescription(false);
  };

  // Helper to clean text for display (remove plugin syntax like due:YYYY-MM-DD)
  const getDisplayText = (text: string) => {
    let processed = text.replace(/due:\d{4}-\d{2}-\d{2}/g, '').trim();
    
    // Explicitly handle <url> syntax to ensure it renders as a link
    // We need to be careful not to double-linkify if it's already [url](url)
    // But <url> is distinct.
    processed = processed.replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)');

    // Also handle plain URLs that might have been passed through (e.g. if parser didn't wrap them)
    // But avoid matching inside existing markdown links [text](url) or <url> (if any left)
    // This regex is tricky. A safer way is to let ReactMarkdown handle plain URLs via remark-gfm.
    // BUT, if we want to ensure they are clickable even if remark-gfm misses them (unlikely for standard URLs),
    // we can leave them.
    // The issue "nothing is show" suggests that maybe the text is empty?
    // If text is just "<https://...>", processed becomes "[https://...](https://...)"
    
    // Tag processing: Replace #tag with link format for custom rendering

    // Tag processing: Replace #tag with link format for custom rendering
    // But ignore \#tag (escaped)
    processed = processed.replace(/(?<!\\)#([a-zA-Z0-9_]+)/g, '[#$1](tag:$1)');
    
    // Unescape \# to #
    processed = processed.replace(/\\#/g, '#');

    // Auto-linkify domains without protocol (e.g. google.com)
    // Matches common TLDs, avoids existing links or protocols
    const urlRegex = /(^|\s)(?!https?:\/\/)(?!\[)((?:www\.|[\w-]+\.)+(?:com|org|net|io|gov|edu|co|me|app|dev|xyz))(?=\s|$)/gi;
    
    processed = processed.replace(urlRegex, (_match, prefix, url) => {
      return `${prefix}[${url}](https://${url})`;
    });

    return processed;
  };

  // Helper to get font size class
  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-xs';
      case 'normal': return 'text-sm';
      case 'large': return 'text-base';
      case 'xl': return 'text-lg';
      default: return 'text-base';
    }
  };

  const getCheckboxSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'w-4 h-4';
      case 'normal': return 'w-5 h-5';
      case 'large': return 'w-5 h-5';
      case 'xl': return 'w-6 h-6';
      default: return 'w-5 h-5';
    }
  };

  const getLineHeightClass = () => {
    switch (fontSize) {
      case 'small': return 'h-4'; // leading-4
      case 'normal': return 'h-5'; // leading-5
      case 'large': return 'h-6'; // leading-6
      case 'xl': return 'h-7'; // leading-7
      default: return 'h-6';
    }
  };

  const getHeaderFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-lg';
      case 'normal': return 'text-xl';
      case 'large': return 'text-2xl';
      case 'xl': return 'text-3xl';
      default: return 'text-xl';
    }
  };

  if (task.type === 'header') {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        data-task-id={task.id}
        className={`
          task-item group flex items-center gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
          ${compact ? 'p-1 pt-2' : 'p-3 pt-6'}
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
          ${isEditing ? 'is-editing' : ''}
        `}
      >
        <DropIndicator />
        <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>

        <button
          onClick={() => onToggleSection?.(task.id)}
          className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-primary"
          title={sectionCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {sectionCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        {isEditing ? (
          <input
            ref={headerInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onFocus={() => onHeaderEditStart?.(task.id)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className={`flex-1 bg-transparent border-none outline-none font-bold text-base-content p-0 ${getHeaderFontSizeClass()}`}
          />
        ) : (
          <h2 
            onMouseDown={(e) => {
              e.preventDefault();
              onHeaderEditStart?.(task.id);
              setModes({});
              setIsEditing(true);
            }}
            className={`font-bold text-base-content flex-1 cursor-text ${getHeaderFontSizeClass()}`}
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
          task-item group flex items-center gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
          ${compact ? 'p-0.5' : 'p-2'}
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
          ${isEditing ? 'is-editing' : ''}
        `}
      >
        <DropIndicator />
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
            className={`flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal ${getFontSizeClass()}`}
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
      data-task-id={task.id}
      className={`
        task-item group flex items-start gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
        ${compact ? 'p-1' : 'p-3'}
        ${isAnimating ? 'opacity-0 -translate-y-4 max-h-0 overflow-hidden py-0 border-none' : 'opacity-100 max-h-[2000px]'}
        ${isDragging ? 'opacity-50 bg-base-200' : ''}
        ${(isEditing || isEditingDescription) ? 'is-editing' : ''}
        ${taskItemPluginClassNames.join(' ')}
      `}
    >
      <DropIndicator />
      <div {...attributes} {...listeners} className={`cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center ${getLineHeightClass()}`}>
        <GripVertical size={16} />
      </div>

      <div className={`flex items-center justify-center flex-shrink-0 ${getLineHeightClass()}`}>
        <button 
          onClick={() => onToggle(task.id)}
          className="transition-colors p-0 rounded-full hover:bg-base-200 group/checkbox"
        >
          {task.completed ? (
            <div className={`${getCheckboxSizeClass()} rounded-full border-2 border-base-content/30 bg-base-content/30`}></div>
          ) : (
            <div className={`${getCheckboxSizeClass()} rounded-full border-2 border-base-content/50 group-hover/checkbox:border-primary`}></div>
          )}
        </button>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="w-full">
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
                className={`flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal w-full ${getFontSizeClass()}`}
              />
              {/* Action Bar */}
              <div className="flex gap-2 mt-2">
                {!isEditingDescription && (
                <button 
                  onMouseDown={(e) => { e.preventDefault(); handleToggleDescriptionEdit(); }}
                  className="btn btn-xs btn-ghost gap-1 text-base-content/60 font-normal"
                >
                  <AlignLeft size={12} /> Add Details
                </button>
                )}
                <button 
                  onMouseDown={(e) => { e.preventDefault(); handleAddDueDate(); }}
                  className="btn btn-xs btn-ghost gap-1 text-base-content/60 font-normal"
                >
                  <Calendar size={12} /> Due Date
                </button>
              </div>
            </div>
          ) : (
            <div 
              onMouseDown={(e) => { e.preventDefault(); setModes({}); setIsEditing(true); }}
                  className={`flex-1 break-words cursor-text prose prose-sm max-w-none min-h-[1.5em] ${task.completed ? 'line-through text-base-content/30' : 'text-base-content'} ${compact ? 'leading-snug' : ''} ${getFontSizeClass()}`}
                >
              <ReactMarkdown 
                remarkPlugins={[remarkGfm, remarkBreaks]} 
                components={{ 
                  p: ({children}) => <span className="m-0 p-0">{children}</span>,
                  // eslint-disable-next-line @typescript-eslint/no-unused-vars
                  a: ({node, ...props}) => {
                    const href = props.href || '';
                    if (href.startsWith('tag:')) {
                      const tag = href.replace('tag:', '');
                      return (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary mx-0.5 select-none">
                          #{tag}
                        </span>
                      );
                    }
                    return (
                      <a 
                        {...props} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary hover:underline cursor-pointer relative z-10"
                        onClick={(e) => e.stopPropagation()} 
                      />
                    );
                  }
                }}
              >
                {getDisplayText(task.text)}
              </ReactMarkdown>
            </div>
          )}

          {isRemindersLinked && (
            <span
              className="flex items-center text-base-content/40"
              title="Linked to Reminders"
              aria-label="Linked to Reminders"
            >
              <Link2 size={14} />
            </span>
          )}
          
          {/* Plugin Extensions (rendered further down with exit handler) */}

          {/* Plugin Action Buttons (hover visible) */}
          {pluginRegistry.renderTaskActionButtons(task, taskItemContext).length > 0 && (
            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {pluginRegistry.renderTaskActionButtons(task, taskItemContext).map((node, idx) => (
                <span key={idx}>{node}</span>
              ))}
            </div>
          )}

          {/* Copy Button */}
          <button 
            onClick={handleCopy}
            className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary"
            title="Copy task and description"
          >
            {justCopied ? <Check size={16} /> : <Copy size={16} />}
          </button>

          {/* Description Toggle */}
            {(task.description || isEditingDescription) && !shouldHideDescriptionToggle && (
          <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                // Toggle description visibility but do NOT exit Zen Mode.
                // Prevent click from blurring inputs when in Zen Mode.
                e.stopPropagation();
                setShowDescription(prev => !prev);
                // If entering the description view while editing, keep description edit active
                if (!showDescription && isEditing) {
                  setIsEditingDescription(true);
                }
              }}
              className={`btn btn-ghost btn-xs btn-circle ${showDescription ? 'text-primary' : 'text-base-content/40'}`}
            >
              {showDescription ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>

        {/* Description Area */}
        {(showDescription || isEditingDescription) && (
          <div className="mt-2 pl-1">
            {isEditingDescription ? (
              <div className="flex flex-col gap-2">
                {pluginRegistry.renderDescriptionToolbars(task, taskItemContext).length > 0 && (
                  <div className="flex justify-end mb-1">
                    {pluginRegistry.renderDescriptionToolbars(task, taskItemContext).map((node, idx) => (
                      <span key={idx}>{node}</span>
                    ))}
                  </div>
                )}
                
                {isPreviewMode ? (
                  <div className="w-full bg-base-200/30 rounded p-4 text-sm text-base-content/80 min-h-[100px] prose prose-sm max-w-none">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        p: ({children}) => <span className="block mb-2 last:mb-0">{children}</span>,
                        a: ({node, ...props}) => <a {...props} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} />,
                        ul: ({children}) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                        li: ({children}) => <li className="mb-1">{children}</li>,
                        blockquote: ({children}) => <blockquote className="border-l-4 border-base-300 pl-2 italic my-2">{children}</blockquote>,
                        code: ({children}) => <code className="bg-base-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                        pre: ({children}) => <pre className="bg-base-300 rounded p-2 overflow-x-auto my-2 text-xs font-mono">{children}</pre>,
                      }}
                    >
                      {editDescription || '*No description*'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    ref={descriptionRef}
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={handleDescriptionKeyDown}
                    onBlur={handleDescriptionBlur}
                    placeholder="Add a description..."
                    className="w-full bg-base-200/50 rounded p-2 text-sm text-base-content/80 border-none outline-none resize-none overflow-hidden"
                  />
                )}
              </div>
            ) : (
              <div 
                onMouseDown={(e) => { e.preventDefault(); setModes({}); setIsEditingDescription(true); }}
                className="text-sm text-base-content/70 cursor-text border-l-2 border-base-300 pl-3 py-1 prose prose-sm max-w-none"
                    >
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkBreaks]}
                  components={{
                    p: ({children}) => <span className="block mb-1 last:mb-0">{children}</span>,
                    a: ({node, ...props}) => (
                      <a 
                        {...props} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="text-primary hover:underline cursor-pointer"
                        onClick={(e) => e.stopPropagation()} 
                      />
                    )
                  }}
                >
                  {task.description || ''}
                </ReactMarkdown>
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Render Plugin UI */}
      {pluginRegistry.getPlugins().map(plugin => {
        if (plugin.enabled && plugin.instance.onTaskRender) {
          return (
            <div key={plugin.name}>
              {plugin.instance.onTaskRender(task, {
                isEditing,
                isZenMode: preventAutoClose,
                onExit: () => { void requestExit(); }
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
