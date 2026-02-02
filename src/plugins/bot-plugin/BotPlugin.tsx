import type { Plugin } from '../pluginEngine';

/**
 * BotPlugin
 * 
 * Enables bot-aware rendering for markdown tasks:
 * - Parses <!-- bot: ... --> comments
 * - Renders them with 🤖 icon and blue styling
 * - Shows inline badges for subtask markers
 * - Provides suggested tasks UI (Accept/Reject)
 * 
 * Default enabled since bot integration is a core feature.
 */
export class BotPlugin implements Plugin {
  name = 'Bot';
  defaultEnabled = true;

  onEnable() {
    // Rendering logic is handled via exports from ClawdbotRenderer
    // Components check plugin enabled state before rendering
  }

  onDisable() {
    // When disabled, bot comments render as plain HTML comments
    // (which browsers hide by default)
  }

  renderSettings() {
    return (
      <div className="text-sm text-base-content/70">
        <p>Enables special rendering for bot comments:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>🤖 Blue badges for inline markers</li>
          <li>Styled comment blocks in descriptions</li>
          <li>Accept/Reject UI for suggested tasks</li>
        </ul>
      </div>
    );
  }
}

// Re-export all bot utilities and components
export {
  parseBotComments,
  extractInlineBotComment,
  isBotComment,
  enhanceDescriptionWithBot,
  parseBotSuggestedSection,
  removeBotSuggestedTask,
  BotCommentView,
  BotInlineBadge,
  BotSuggestedSection,
} from './BotRenderer';

export type { BotComment, BotSuggestedTask } from './BotRenderer';
