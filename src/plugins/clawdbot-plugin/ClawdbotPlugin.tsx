import type { Plugin } from '../pluginEngine';

/**
 * ClawdbotPlugin
 * 
 * Enables Clawdbot-aware rendering for markdown tasks:
 * - Parses <!-- Clawdbot: ... --> comments
 * - Renders them with 🤖 icon and blue styling
 * - Shows inline badges for subtask markers
 * - Provides suggested tasks UI (Accept/Reject)
 * 
 * Default enabled since Clawdbot integration is a core feature.
 */
export class ClawdbotPlugin implements Plugin {
  name = 'Clawdbot';
  defaultEnabled = true;

  onEnable() {
    // Rendering logic is handled via exports from ClawdbotRenderer
    // Components check plugin enabled state before rendering
  }

  onDisable() {
    // When disabled, Clawdbot comments render as plain HTML comments
    // (which browsers hide by default)
  }

  renderSettings() {
    return (
      <div className="text-sm text-base-content/70">
        <p>Enables special rendering for Clawdbot comments:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>🤖 Blue badges for inline markers</li>
          <li>Styled comment blocks in descriptions</li>
          <li>Accept/Reject UI for suggested tasks</li>
        </ul>
      </div>
    );
  }
}

// Re-export all Clawdbot utilities and components
export {
  parseClawdbotComments,
  extractInlineClawdbotComment,
  isClawdbotComment,
  enhanceDescriptionWithClawdbot,
  parseClawdbotSuggestedSection,
  removeClawdbotSuggestedTask,
  ClawdbotCommentView,
  ClawdbotInlineBadge,
  ClawdbotSuggestedSection,
} from './ClawdbotRenderer';

export type { ClawdbotComment, ClawdbotSuggestedTask } from './ClawdbotRenderer';
