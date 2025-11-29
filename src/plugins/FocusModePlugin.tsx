import type { Plugin, PluginAPI } from './pluginEngine';
import { Zap } from 'lucide-react';
import { useState, useEffect } from 'react';

// Helper component for the button to manage state
const FocusButton = ({ plugin }: { plugin: FocusModePlugin }) => {
  const [isActive, setIsActive] = useState(plugin.isActive);

  useEffect(() => {
    // Sync state if changed externally
    const interval = setInterval(() => {
      if (plugin.isActive !== isActive) setIsActive(plugin.isActive);
    }, 100);
    return () => clearInterval(interval);
  }, [isActive, plugin]);

  return (
    <button 
      onClick={() => {
        plugin.toggleActive();
        setIsActive(plugin.isActive);
      }}
      className={`btn btn-xs btn-ghost btn-square ${isActive ? 'text-primary bg-primary/10' : 'text-base-content/60 hover:text-primary'}`}
      title="Toggle Focus Mode"
    >
      <Zap size={18} />
    </button>
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
    // When plugin is enabled, we don't necessarily start the mode immediately
    // But for UX consistency with previous version, let's start it if it was active?
    // Actually, let's default to OFF when enabled, user must click button.
    this.isActive = false;
    this.updateStyles();
  }

  onDisable() {
    this.isActive = false;
    this.updateStyles();
  }

  toggleActive() {
    this.isActive = !this.isActive;
    this.updateStyles();
  }

  renderHeaderButton() {
    return <FocusButton key="focus-mode-btn" plugin={this} />;
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
      /* Cinema Mode Styles */
      body.focus-mode-active .task-item {
        opacity: 0.1;
        filter: blur(2px);
        transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
        transform: scale(0.98);
      }
      
      body.focus-mode-active .task-item:hover,
      body.focus-mode-active .task-item:focus-within {
        opacity: 1;
        filter: none;
        transform: scale(1.05);
        z-index: 50;
        background-color: var(--fallback-b1,oklch(var(--b1)/1));
        box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
        border-radius: 0.75rem;
        border-color: transparent;
        margin-top: 1rem;
        margin-bottom: 1rem;
        padding: 1.5rem;
      }

      /* Enlarge text in focused item */
      body.focus-mode-active .task-item:hover .prose,
      body.focus-mode-active .task-item:focus-within .prose {
        font-size: 1.25rem;
        line-height: 1.75rem;
      }

      /* Make description pop out */
      body.focus-mode-active .task-item:hover textarea,
      body.focus-mode-active .task-item:focus-within textarea {
        font-size: 1.1rem;
      }
    `;
    
    this.styleElement = document.createElement('style');
    this.styleElement.textContent = css;
    document.head.appendChild(this.styleElement);
  }
}
