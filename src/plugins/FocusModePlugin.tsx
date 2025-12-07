import type { Plugin, PluginAPI } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Timer, Play, Pause, RotateCcw, Type } from 'lucide-react';
import { useTodoStore } from '../store/useTodoStore';

const ZenModeControls = ({ task }: { task: Task }) => {
  const [elapsed, setElapsed] = useState(0);
  const [targetTime] = useState(25 * 60); // Default 25 mins
  const [isRunning, setIsRunning] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [readTime, setReadTime] = useState(0);
  const updateTaskText = useTodoStore(state => state.updateTaskText);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Initialize timer from task tag #time:XXm
  useEffect(() => {
    const match = task.text.match(/#time:(\d+)m/);
    if (match) {
      setElapsed(parseInt(match[1]) * 60);
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

  // Save time to task when pausing or unmounting
  const saveTime = async () => {
    const minutes = Math.floor(elapsed / 60);
    if (minutes === 0) return;

    let newText = task.text;
    if (newText.match(/#time:\d+m/)) {
      newText = newText.replace(/#time:\d+m/, `#time:${minutes}m`);
    } else {
      newText = `${newText} #time:${minutes}m`;
    }
    
    if (newText !== task.text) {
      await updateTaskText(task.id, newText);
    }
  };

  const toggleTimer = () => {
    if (isRunning) {
      saveTime();
    }
    setIsRunning(!isRunning);
  };

  const formatTime = (seconds: number) => {
    const absSeconds = Math.abs(seconds);
    const m = Math.floor(absSeconds / 60);
    const s = absSeconds % 60;
    return `${seconds < 0 ? '-' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const remainingTime = targetTime - elapsed;

  return createPortal(
    <div className="zen-controls fixed top-2 left-1/2 -translate-x-1/2 flex items-center justify-center z-[10000] animate-[zen-fade-in_0.5s_ease_0.3s_forwards] opacity-0 pointer-events-none w-full">
      <div className="bg-base-100/90 backdrop-blur-md shadow-xl border border-base-200 rounded-full px-6 py-2 flex items-center gap-6 pointer-events-auto">
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
          <div className="flex flex-col items-start">
            <span className="text-[10px] font-bold text-base-content/40 uppercase tracking-wider flex items-center gap-1">
              <Timer size={10} /> Timer
            </span>
            <span className={`text-xl font-mono font-bold tabular-nums leading-none ${remainingTime < 0 ? 'text-error' : 'text-primary'}`}>
              {formatTime(remainingTime)}
            </span>
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
                saveTime();
              }}
              className="btn btn-xs btn-circle btn-ghost"
              title="Reset"
            >
              <RotateCcw size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
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

  onTaskRender(task: Task, context?: { isEditing: boolean }) {
    if (!context?.isEditing) return null;
    return <ZenModeControls task={task} />;
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
      body.focus-mode-active .task-item.is-editing {
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
        padding: 4rem !important;
        
        overflow-y: auto !important;
        display: flex !important;
        align-items: flex-start !important;
        margin: 0 !important;
        
        animation: zen-modal-pop 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards !important;
      }

      /* Backdrop for Zen Mode */
      body.focus-mode-active:has(.task-item.is-editing)::before {
        content: '';
        position: fixed;
        inset: 0;
        background: var(--base-100);
        opacity: 0;
        z-index: 9998;
        animation: zen-backdrop-fade 0.4s ease-out forwards;
      }

      /* Prevent body scroll in Zen Mode */
      body.focus-mode-active:has(.task-item.is-editing) {
        overflow: hidden !important;
      }

      /* Hide other items completely when one is editing */
      body.focus-mode-active:has(.task-item.is-editing) .task-item:not(.is-editing) {
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
      }

      /* Hide drag handle in Zen Mode */
      body.focus-mode-active .task-item.is-editing .cursor-grab {
        display: none;
      }

      /* Text Zoom and Layout Adjustments */
      body.focus-mode-active .task-item.is-editing textarea,
      body.focus-mode-active .task-item.is-editing input[type="text"] {
        font-size: 1.75rem !important;
        line-height: 2.5rem !important;
        padding: 1rem 0 !important;
        font-weight: 500 !important;
        letter-spacing: -0.02em !important;
      }

      body.focus-mode-active .task-item.is-editing .prose {
        font-size: 1.25rem !important;
      }

      /* Ensure description area expands but stays compact to text */
      body.focus-mode-active .task-item.is-editing textarea[placeholder="Add a description..."] {
        min-height: auto !important;
        font-size: 1.25rem !important;
        line-height: 2rem !important;
        background-color: transparent !important;
        margin-top: 1rem !important;
        padding-bottom: 2rem !important;
      }
      
      /* Adjust checkbox size in Zen Mode - make it cleaner */
      body.focus-mode-active .task-item.is-editing button[class*="rounded-full"] {
        margin-top: 0.5rem;
      }
      body.focus-mode-active .task-item.is-editing button[class*="rounded-full"] div {
        width: 1.5rem;
        height: 1.5rem;
        border-width: 2px;
        opacity: 0.8;
        transition: opacity 0.2s;
      }
      body.focus-mode-active .task-item.is-editing button[class*="rounded-full"]:hover div {
        opacity: 1;
      }
      
      /* Hide action buttons until hover in Zen Mode to reduce clutter */
      body.focus-mode-active .task-item.is-editing .flex.gap-2.mt-2 {
        opacity: 0.4;
        transition: opacity 0.2s;
      }
      body.focus-mode-active .task-item.is-editing .flex.gap-2.mt-2:hover {
        opacity: 1;
      }

      /* Show Zen Controls only when editing */
      body.focus-mode-active .task-item.is-editing .zen-controls {
        opacity: 1 !important;
        pointer-events: auto !important;
        animation: zen-fade-in 0.5s ease 0.3s forwards;
      }

      @keyframes zen-fade-in {
        from { opacity: 0; transform: translateY(10px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
  }
}
