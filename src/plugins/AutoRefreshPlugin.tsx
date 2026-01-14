import type { Plugin } from './pluginEngine';
import { useTodoStore } from '../store/useTodoStore';
import { useState, useEffect, useRef } from 'react';

export class AutoRefreshPlugin implements Plugin {
  name = 'AutoRefresh';
  defaultEnabled = false;

  onEnable() {
    // Logic handled in component
  }

  renderSettings() {
    return <AutoRefreshSettings />;
  }

  // We need a component to handle the interval lifecycle
  renderDashboard() {
    return <AutoRefreshController />;
  }
}

function AutoRefreshSettings() {
  const [interval, setIntervalVal] = useState(() => {
    const saved = localStorage.getItem('auto-refresh-interval');
    return saved ? parseInt(saved, 10) : 60;
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 5) { // Minimum 5 seconds
      setIntervalVal(val);
      localStorage.setItem('auto-refresh-interval', val.toString());
    }
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm">Refresh interval (seconds)</span>
      <input 
        type="number" 
        value={interval} 
        onChange={handleChange}
        className="input input-bordered input-sm w-20"
        min="5"
      />
    </div>
  );
}

function AutoRefreshController() {
  const refreshCurrentFile = useTodoStore(state => state.refreshCurrentFile);
  const intervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const getInterval = () => {
      const saved = localStorage.getItem('auto-refresh-interval');
      return saved ? parseInt(saved, 10) * 1000 : 60000;
    };

    const run = () => {
      // Check if user is editing (active element is an input/textarea in a task item)
      const active = document.activeElement;
      const isEditing = active && (
        (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') &&
        active.closest('.task-item')
      );

      if (isEditing) {
        console.log('[AutoRefresh] User is editing, skipping refresh.');
        return;
      }

      console.log('[AutoRefresh] Refreshing todos...');
      refreshCurrentFile({ background: true }).catch(e => {
        console.error('[AutoRefresh] Background refresh failed', e);
      });
    };

    // Initial run
    intervalRef.current = setInterval(run, getInterval());

    // Listen for storage changes to update interval dynamically
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'auto-refresh-interval') {
        if (intervalRef.current) clearInterval(intervalRef.current);
        intervalRef.current = setInterval(run, getInterval());
      }
    };

    window.addEventListener('storage', handleStorage);
    // Also listen for local custom event if we want instant updates within same tab
    // For now, simple mount/unmount is enough if user toggles plugin.
    // But if user changes settings, this component won't re-mount.
    // We can poll the localStorage or use a custom event.
    
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('storage', handleStorage);
    };
  }, [refreshCurrentFile]);

  return null; // Invisible component
}
