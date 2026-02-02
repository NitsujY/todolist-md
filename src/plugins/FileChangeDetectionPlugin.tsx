import type { Plugin } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';
import { useState, useEffect, useRef } from 'react';

/**
 * FileChangeDetectionPlugin
 * 
 * Polls file modification time (mtime) every 5-10 seconds to detect external changes.
 * Shows a banner when file is modified by Clawdbot or external editor.
 * User can reload to see updates.
 */
export class FileChangeDetectionPlugin implements Plugin {
  name = 'FileChangeDetection';
  defaultEnabled = true;

  onEnable() {
    // Logic handled in component
  }

  renderSettings() {
    return <FileChangeSettings />;
  }

  renderDashboard() {
    return <FileChangeController />;
  }
}

function FileChangeSettings() {
  const [interval, setIntervalVal] = useState(() => {
    const saved = localStorage.getItem('file-change-interval');
    return saved ? parseInt(saved, 10) : 5;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 3) {
      setIntervalVal(val);
      localStorage.setItem('file-change-interval', val.toString());
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-sm">Check for changes every (seconds)</span>
        <input 
          type="number" 
          value={interval} 
          onChange={handleChange}
          className="input input-bordered input-sm w-20"
          min="3"
        />
      </div>
      <div className="text-xs opacity-60">
        Detects when Clawdbot or external editor modifies the file
      </div>
    </div>
  );
}

function FileChangeController() {
  const { currentFile, isFolderMode, storage, fileCache } = useTodoStore();
  const [hasExternalChange, setHasExternalChange] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastKnownMtimeRef = useRef<number | null>(null);

  const targetFile = isFolderMode ? currentFile : 'todo.md';

  useEffect(() => {
    // Reset on file change
    setHasExternalChange(false);
    lastKnownMtimeRef.current = null;

    // Initialize lastKnownMtime from cache
    const cached = fileCache[targetFile];
    if (cached?.meta?.lastModified) {
      lastKnownMtimeRef.current = cached.meta.lastModified;
    } else if (cached?.meta?.modifiedTime) {
      lastKnownMtimeRef.current = new Date(cached.meta.modifiedTime).getTime();
    }

    const getInterval = () => {
      const saved = localStorage.getItem('file-change-interval');
      return saved ? parseInt(saved, 10) * 1000 : 5000;
    };

    const checkFileChange = async () => {
      // Skip if user is editing
      const active = document.activeElement;
      const isEditing = active && (
        (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') &&
        active.closest('.task-item')
      );

      if (isEditing) {
        return;
      }

      try {
        // Only check if storage supports metadata
        if (!storage.readWithMeta) {
          return;
        }

        const result = await storage.readWithMeta(targetFile);
        
        if (!result || !result.meta) {
          return;
        }

        // Extract mtime
        let currentMtime: number | null = null;
        if (result.meta.lastModified) {
          currentMtime = result.meta.lastModified;
        } else if (result.meta.modifiedTime) {
          currentMtime = new Date(result.meta.modifiedTime).getTime();
        }

        if (!currentMtime) {
          return;
        }

        // Initialize on first check
        if (lastKnownMtimeRef.current === null) {
          lastKnownMtimeRef.current = currentMtime;
          return;
        }

        // Detect change
        if (currentMtime > lastKnownMtimeRef.current) {
          console.log('[FileChangeDetection] External change detected', {
            file: targetFile,
            old: new Date(lastKnownMtimeRef.current),
            new: new Date(currentMtime),
          });
          setHasExternalChange(true);
          lastKnownMtimeRef.current = currentMtime;
        }
      } catch (e) {
        // Silently fail - file might not exist yet or permission issues
        console.debug('[FileChangeDetection] Check failed', e);
      }
    };

    // Run initial check after 1 second
    const initialTimeout = setTimeout(checkFileChange, 1000);

    // Start polling
    intervalRef.current = setInterval(checkFileChange, getInterval());

    return () => {
      clearTimeout(initialTimeout);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [targetFile, storage, fileCache]);

  if (!hasExternalChange) {
    return null;
  }

  return <FileChangeBanner onReload={() => setHasExternalChange(false)} />;
}

function FileChangeBanner({ onReload }: { onReload: () => void }) {
  const refreshCurrentFile = useTodoStore(state => state.refreshCurrentFile);

  const handleReload = async () => {
    await refreshCurrentFile({ background: false });
    onReload();
  };

  const handleDismiss = () => {
    onReload();
  };

  return (
    <div className="fixed top-14 left-0 right-0 z-[70] bg-warning text-warning-content shadow-lg">
      <div className="container mx-auto px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <div>
            <div className="font-bold">File changed externally</div>
            <div className="text-sm opacity-80">
              This file was modified by Clawdbot or another editor. Reload to see updates.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <button 
            className="btn btn-sm btn-ghost"
            onClick={handleDismiss}
          >
            Dismiss
          </button>
          <button 
            className="btn btn-sm btn-primary"
            onClick={handleReload}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
