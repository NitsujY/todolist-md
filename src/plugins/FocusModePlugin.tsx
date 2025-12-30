import type { Plugin, PluginAPI, TaskItemContext } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';
import { Sparkles } from 'lucide-react';
import { ZenModeControls } from './ZenModeControls';

export class FocusModePlugin implements Plugin {
  name = 'FocusMode';
  defaultEnabled = false;
  public isActive = false;
  private styleElement: HTMLStyleElement | null = null;
  private readonly modeId = 'FocusMode:Zen';

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

  renderTaskActionButton(task: Task, context: TaskItemContext) {
    if (!this.isActive) return null;
    if (task.type === 'header') return null;

    return (
      <button
        onMouseDown={(e) => {
          e.preventDefault();
          context.controls.guardAutoClose(200);
          context.modes.setModeEnabled(this.modeId, true);
          context.controls.requestEdit();
          context.controls.requestEditDescription();
        }}
        onClick={(e) => {
          e.stopPropagation();
        }}
        title="Enter Zen Mode"
        className="btn btn-ghost btn-xs btn-circle text-base-content/50 hover:text-primary"
      >
        <Sparkles size={14} />
      </button>
    );
  }

  renderDescriptionToolbar(_task: Task, context: TaskItemContext) {
    const inZen = this.isActive && context.modes.isModeEnabled(this.modeId) && context.isEditingDescription;
    if (!inZen) return null;

    return (
      <div className="join">
        <button
          className={`join-item btn btn-xs ${context.descriptionView.view === 'write' ? 'btn-active' : ''}`}
          onClick={() => context.descriptionView.setView('write')}
        >
          Write
        </button>
        <button
          className={`join-item btn btn-xs ${context.descriptionView.view === 'preview' ? 'btn-active' : ''}`}
          onClick={() => context.descriptionView.setView('preview')}
        >
          Preview
        </button>
      </div>
    );
  }

  getTaskItemClassNames(task: Task, context: TaskItemContext) {
    if (!this.isActive) return [];
    if (task.type === 'header') return [];
    if (!context.isEditing && !context.isEditingDescription) return [];
    if (!context.modes.isModeEnabled(this.modeId)) return [];
    return ['zen-mode'];
  }

  shouldPreventTaskEditAutoClose(task: Task, context: TaskItemContext) {
    if (!this.isActive) return false;
    if (task.type === 'header') return false;
    return context.modes.isModeEnabled(this.modeId);
  }

  shouldHideDescriptionToggle(task: Task, context: TaskItemContext) {
    return this.shouldPreventTaskEditAutoClose(task, context);
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
