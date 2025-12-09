import type { Plugin, PluginAPI } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';
import { useState, useEffect, useRef } from 'react';
// Zen controls render inline inside the task-item; no portal needed.
import { Timer, Play, Pause, RotateCcw, Type, CheckCircle2, X } from 'lucide-react';
import { useTodoStore } from '../store/useTodoStore';

const ZenModeControls = ({ task, onExit }: { task: Task; onExit?: () => void }) => {
  const [elapsed, setElapsed] = useState(0);
  const [targetTime, setTargetTime] = useState(25 * 60); // Default 25 mins
  const [isEditingTime, setIsEditingTime] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('25');
  const [isRunning, setIsRunning] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);
  const toggleTask = useTodoStore(state => state.toggleTask);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize timer - but don't persist to tag unless user wants to
  // We just use the tag to set initial state if present, but we don't write back constantly
  useEffect(() => {
    const match = task.text.match(/#time:(\d+)m/);
    if (match) {
      const mins = parseInt(match[1]);
      setTargetTime(mins * 60);
      setCustomMinutes(mins.toString());
    }
  }, []); // Only on mount

  // Calculate stats
  useEffect(() => {
    const text = (task.text + ' ' + (task.description || '')).trim();
    const words = text.split(/\s+/).filter(w => w.length > 0).length;
    setWordCount(words);
    setReadTime(Math.ceil(words / 200)); // 200 wpm
  }, [task.text, task.description]);

  // Timer logic
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setElapsed(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning]);

  const toggleTimer = () => {
    setIsRunning(!isRunning);
  };

  const handleTimeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customMinutes);
    if (!isNaN(mins) && mins > 0) {
      setTargetTime(mins * 60);
      setElapsed(0);
      setIsRunning(false);
      setIsEditingTime(false);
      
      // We do NOT update the tag in text anymore as per request
      // "it can be reset evertime the user leave and enter"
      // So we just keep it in local state for this session
    }
  };

  const formatTime = (seconds: number) => {
    const absSeconds = Math.abs(seconds);
    const m = Math.floor(absSeconds / 60);
    const s = absSeconds % 60;
    return `${seconds < 0 ? '-' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remainingTime = targetTime - elapsed;

  return (
    <div className="zen-controls w-full animate-[zen-fade-in_0.5s_ease_0.3s_both] pointer-events-auto flex justify-center mb-8">
      <div className="zen-inner bg-base-100/80 backdrop-blur-md shadow-lg border border-base-200 rounded-full px-6 py-2 flex items-center gap-6">
        {/* Stats Section */}
        <div className="flex items-center gap-4 border-r border-base-content/10 pr-6">
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider flex items-center gap-1">
              <Type size={10} /> Words
            </span>
            <span className="text-sm font-bold tabular-nums leading-none">{wordCount}</span>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider">Read</span>
            <span className="text-sm font-bold tabular-nums leading-none">~{readTime}m</span>
          </div>
        </div>

        {/* Timer Section */}
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-start min-w-[60px]">
            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider flex items-center gap-1">
              <Timer size={10} /> Timer
            </span>
            {isEditingTime ? (
              <form onSubmit={handleTimeSubmit} className="flex items-center">
                <input
                  autoFocus
                  type="number"
                  className="input input-xs input-ghost p-0 h-5 w-12 font-mono text-lg font-bold"
                  value={customMinutes}
                  onChange={e => setCustomMinutes(e.target.value)}
                  onBlur={() => setIsEditingTime(false)}
                />
                <span className="text-xs font-bold opacity-50">m</span>
              </form>
            ) : (
              <button 
                onClick={() => setIsEditingTime(true)}
                className={`text-xl font-mono font-bold tabular-nums leading-none hover:opacity-70 transition-opacity ${remainingTime < 0 ? 'text-error' : 'text-primary'}`}
                title="Click to edit duration"
              >
                {formatTime(remainingTime)}
              </button>
            )}
          </div>
          
          <div className="flex gap-1">
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={toggleTimer}
              className={`btn btn-xs btn-circle ${isRunning ? 'btn-error' : 'btn-primary'}`}
              title={isRunning ? 'Pause' : 'Start'}
            >
              {isRunning ? <Pause size={12} /> : <Play size={12} />}
            </button>
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setIsRunning(false);
                setElapsed(0);
              }}
              className="btn btn-xs btn-circle btn-ghost"
              title="Reset"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>

        {/* Complete Button */}
        <div className="pl-6 border-l border-base-content/10 flex items-center gap-2">
          <button 
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              toggleTask(task.id);
              // Optional: Exit on complete? Maybe not, let user admire their work.
            }}
            className="btn btn-sm btn-success gap-2 rounded-full text-white shadow-lg hover:scale-105 transition-transform"
          >
            <CheckCircle2 size={16} />
            Complete
          </button>
          
          {/* Exit Button: trigger full exit callback so task leaves Zen Mode */}
          <button 
            onMouseDown={(e) => {
              e.preventDefault();
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              console.log('Exit button clicked');
              if (onExit) {
                // Call onExit which TaskItem provides to fully save+exit
                onExit();
              } else {
                console.warn('onExit callback missing');
              }
            }}
            className="btn btn-sm btn-circle btn-ghost hover:bg-base-200 ml-2"
            title="Save & Exit Zen Mode"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export class FocusModePlugin implements Plugin {
  name = 'FocusMode';
  defaultEnabled = false;
  public isActive = false;
  private styleElement: HTMLStyleElement | null = null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onInit(_api: PluginAPI) {
    // No actions needed for now
  }

  onEnable() {
    // Auto-activate when enabled
    this.isActive = true;
    this.updateStyles();
  }

  onDisable() {
    this.isActive = false;
    this.updateStyles();
  }

  onTaskRender(task: Task, context?: { isEditing: boolean; isZenMode?: boolean; onExit?: () => void }) {
    if (!context?.isEditing || !context?.isZenMode) return null;
    return <ZenModeControls task={task} onExit={context.onExit} />;
  }

  private updateStyles() {
    if (this.isActive) {
      document.body.classList.add('focus-mode-active');
      this.injectStyles();
    } else {
      document.body.classList.remove('focus-mode-active');
      // We don't remove the style element, just the class triggers it
    }
  }

  private injectStyles() {
    if (this.styleElement) return;
    
    const css = `
      /* Focus Mode Base Styles */
      body.focus-mode-active .task-item {
        transition: opacity 0.3s ease, filter 0.3s ease;
      }

      @keyframes zen-backdrop-fade {
        from { opacity: 0; backdrop-filter: blur(0px); }
        to { opacity: 0.95; backdrop-filter: blur(5px); }
      }

      @keyframes zen-modal-pop {
        from { 
          opacity: 0;
          transform: translate(-50%, -45%) scale(0.95);
        }
        to { 
          opacity: 1;
          transform: translate(-50%, 0) scale(1);
        }
      }

      /* Zen Mode (Editing) */
      body.focus-mode-active .task-item.is-editing.zen-mode {
        position: fixed !important;
        top: 5vh !important;
        left: 50% !important;
        transform: translateX(-50%) !important;
        
        width: 90vw !important;
        max-width: 900px !important;
        height: 90vh !important;
        z-index: 9999 !important;
        
        background-color: var(--base-100) !important;
        box-shadow: 
          0 0 0 1px var(--base-200),
          0 25px 50px -12px rgb(0 0 0 / 0.25) !important;
        border: none !important;
        border-radius: 1.5rem !important;
        padding: 8rem 4rem 4rem 4rem !important;
        
        overflow-y: auto !important;
        display: flex !important;
        align-items: flex-start !important;
        margin: 0 !important;
        
        animation: zen-modal-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }

      /* Backdrop for Zen Mode */
      body.focus-mode-active:has(.task-item.is-editing.zen-mode)::before {
        content: '';
        position: fixed;
        inset: 0;
        background: var(--base-100);
        opacity: 0;
        z-index: 9998;
        animation: zen-backdrop-fade 0.4s ease-out forwards;
      }

      /* Prevent body scroll in Zen Mode */
      body.focus-mode-active:has(.task-item.is-editing.zen-mode) {
        overflow: hidden !important;
      }

      /* Hide other items completely when one is editing */
      body.focus-mode-active:has(.task-item.is-editing.zen-mode) .task-item:not(.is-editing.zen-mode) {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      /* Hide drag handle in Zen Mode */
      body.focus-mode-active .task-item.is-editing.zen-mode .cursor-grab {
        display: none;
      }

      /* Text Zoom and Layout Adjustments */
      body.focus-mode-active .task-item.is-editing.zen-mode textarea,
      body.focus-mode-active .task-item.is-editing.zen-mode input[type="text"] {
        font-size: 1.75rem !important;
        line-height: 2.5rem !important;
        padding: 1rem 0 !important;
        font-weight: 500 !important;
        letter-spacing: -0.02em !important;
      }

      body.focus-mode-active .task-item.is-editing.zen-mode .prose {
        font-size: 1.25rem !important;
      }

      /* Ensure description area expands but stays compact to text */
      body.focus-mode-active .task-item.is-editing.zen-mode textarea[placeholder="Add a description..."] {
        min-height: 150px !important;
        width: 100% !important;
        font-size: 1.25rem !important;
        line-height: 2rem !important;
        background-color: transparent !important;
        margin-top: 1rem !important;
        padding-bottom: 4rem !important;
      }
      
      /* Adjust checkbox size in Zen Mode - make it cleaner */
      body.focus-mode-active .task-item.is-editing.zen-mode button[class*="rounded-full"] {
        display: none !important;
      }
      
      /* Hide action buttons until hover in Zen Mode to reduce clutter */
      body.focus-mode-active .task-item.is-editing.zen-mode .flex.gap-2.mt-2 {
        opacity: 0.4;
        transition: opacity 0.2s;
      }
      body.focus-mode-active .task-item.is-editing.zen-mode .flex.gap-2.mt-2:hover {
        opacity: 1;
      }

      /* Show Zen Controls only when editing; make it a sticky header inside the modal */
      body.focus-mode-active .task-item.is-editing.zen-mode .zen-controls {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        z-index: 10001;
        display: flex !important;
        justify-content: center !important;
        padding-top: 2rem !important;
        pointer-events: auto;
        animation: zen-fade-in 0.5s ease 0.15s both;
      }

      @keyframes zen-fade-in {
        0% { opacity: 0; transform: translateY(10px); }
        100% { opacity: 1; transform: translateY(0); }
      }
    `;
    
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
  }
}
