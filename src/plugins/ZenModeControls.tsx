import { useState, useRef, useMemo, useEffect } from 'react';
import { Timer, Play, Pause, RotateCcw, Type, CheckCircle2, X } from 'lucide-react';
import { useTodoStore } from '../store/useTodoStore';
import type { Task } from '../lib/MarkdownParser';

export const ZenModeControls = ({ task, onExit }: { task: Task; onExit?: () => void }) => {
  const [elapsed, setElapsed] = useState(0);
  
  // Initialize state lazily to avoid useEffect for initial value
  const [targetTime, setTargetTime] = useState(() => {
    const match = task.text.match(/#time:(\d+)m/);
    return match ? parseInt(match[1]) * 60 : 25 * 60;
  });
  
  const [isEditingTime, setIsEditingTime] = useState(false);
  
  const [customMinutes, setCustomMinutes] = useState(() => {
    const match = task.text.match(/#time:(\d+)m/);
    return match ? match[1] : '25';
  });

  const [isRunning, setIsRunning] = useState(false);
  const toggleTask = useTodoStore(state => state.toggleTask);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derived state (no need for useEffect + useState)
  const text = (task.text + ' ' + (task.description || '')).trim();
  const wordCount = useMemo(() => text.split(/\s+/).filter(w => w.length > 0).length, [text]);
  const readTime = useMemo(() => Math.ceil(wordCount / 200), [wordCount]); // 200 wpm

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
