import type { ReactNode } from 'react';
import { Bot, CheckCircle, XCircle, Clock } from 'lucide-react';

export interface BotComment {
  content: string;
  timestamp?: string;
  source?: 'html' | 'blockquote' | 'inline';
  lineIndex?: number;
  markerType?: 'suggested' | 'question' | 'digest' | 'note' | 'last_review' | 'generic';
}

export interface BotSuggestedTask {
  text: string;
  description?: string;
  generated: string;
}

const BOT_TIMESTAMP_RE = /(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)/;

const stripInlineAnswerSuffix = (text: string) => {
  return String(text ?? '').replace(/\s+Answer\s*:\s*[^\n]*$/i, '').trim();
};

const parseBotMarkerPayload = (raw: string) => {
  const content = String(raw ?? '').trim();
  const timestampMatch = content.match(new RegExp(`\\(${BOT_TIMESTAMP_RE.source}\\)\\s*$`));
  const timestamp = timestampMatch ? timestampMatch[1] : undefined;
  const withoutTimestamp = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '').trim() : content;

  const typed = withoutTimestamp.match(/^(suggested|question|digest|note|last_review)\b\s*(?::\s*(.*))?$/i);
  if (typed) {
    const markerType = typed[1].toLowerCase() as BotComment['markerType'];
    const rest = String(typed[2] ?? '').trim();
    const normalizedContent = markerType === 'question' ? stripInlineAnswerSuffix(rest || markerType) : (rest || markerType);
    return {
      content: normalizedContent,
      markerType,
      timestamp,
    };
  }

  return {
    content: withoutTimestamp,
    markerType: 'generic' as const,
    timestamp,
  };
};

/**
 * Parses bot HTML comments from text
 * Format: <!-- bot: Your insight here -->
 */
export function parseBotComments(text: string): BotComment[] {
  const regex = /<!--\s*bot:\s*([\s\S]*?)\s*-->/gi;
  const comments: BotComment[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const parsed = parseBotMarkerPayload(match[1]);
    comments.push({
      content: String(parsed.content ?? ''),
      timestamp: parsed.timestamp,
      markerType: parsed.markerType,
      source: 'html',
    });
  }

  return comments;
}

/**
 * Extracts inline bot comments from task text
 * Returns clean text and parsed comments separately
 */
export function extractInlineBotComment(text: string): { 
  cleanText: string; 
  comment: BotComment | null;
} {
  // Bot markers can appear anywhere in the task text, e.g.
  // "Design mockup <!-- bot: Added subtask --> #frontend due:2026-02-05"
  // ReactMarkdown will drop HTML comments, so we extract them and show as a badge.

  const regexGlobal = /<!--\s*bot:\s*([\s\S]*?)\s*-->/gi;
  const comments: BotComment[] = [];

  const cleanText = text
    .replace(regexGlobal, (_m, rawContent: string) => {
      const parsed = parseBotMarkerPayload(rawContent);
      comments.push({
        content: String(parsed.content ?? ''),
        timestamp: parsed.timestamp,
        markerType: parsed.markerType,
        source: 'inline',
      });
      // Preserve spacing where the comment was.
      return ' ';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanText, comment: comments[0] ?? null };
}

/**
 * Check if a blockquote contains bot comment
 */
export function isBotComment(blockquoteText: string): boolean {
  return /<!--\s*bot:/i.test(blockquoteText);
}

/**
 * Formats relative time from ISO timestamp
 */
function formatRelativeTime(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    // Format as date if older
    return date.toLocaleDateString();
  } catch {
    return timestamp;
  }
}

/**
 * Renders a bot comment with icon and styling
 */
export function BotCommentView({
  comment,
  onClick,
  actions,
  className,
  variant = 'default',
}: {
  comment: BotComment;
  onClick?: () => void;
  actions?: ReactNode;
  className?: string;
  variant?: 'default' | 'compact';
}) {
  const markerType = comment.markerType ?? 'generic';

  const markerTone = (() => {
    switch (markerType) {
      case 'question':
        return {
          chip: 'border-amber-300/70 bg-amber-100/70 text-amber-800 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
          accent: 'border-l-amber-400 dark:border-l-amber-700',
          text: 'text-amber-900 dark:text-amber-100',
          icon: 'text-amber-600 dark:text-amber-400',
          hover: 'hover:bg-amber-50/60 dark:hover:bg-amber-950/20',
        };
      case 'suggested':
        return {
          chip: 'border-violet-300/70 bg-violet-100/70 text-violet-800 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
          accent: 'border-l-violet-400 dark:border-l-violet-700',
          text: 'text-violet-900 dark:text-violet-100',
          icon: 'text-violet-600 dark:text-violet-400',
          hover: 'hover:bg-violet-50/60 dark:hover:bg-violet-950/20',
        };
      case 'digest':
        return {
          chip: 'border-cyan-300/70 bg-cyan-100/70 text-cyan-800 dark:border-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300',
          accent: 'border-l-cyan-400 dark:border-l-cyan-700',
          text: 'text-cyan-900 dark:text-cyan-100',
          icon: 'text-cyan-600 dark:text-cyan-400',
          hover: 'hover:bg-cyan-50/60 dark:hover:bg-cyan-950/20',
        };
      case 'note':
        return {
          chip: 'border-slate-300/70 bg-slate-100/70 text-slate-700 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300',
          accent: 'border-l-slate-400 dark:border-l-slate-700',
          text: 'text-slate-700 dark:text-slate-200',
          icon: 'text-slate-500 dark:text-slate-400',
          hover: 'hover:bg-slate-100/70 dark:hover:bg-slate-800/40',
        };
      case 'last_review':
        return {
          chip: 'border-emerald-300/70 bg-emerald-100/70 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
          accent: 'border-l-emerald-400 dark:border-l-emerald-700',
          text: 'text-emerald-900 dark:text-emerald-100',
          icon: 'text-emerald-600 dark:text-emerald-400',
          hover: 'hover:bg-emerald-50/60 dark:hover:bg-emerald-950/20',
        };
      default:
        return {
          chip: 'border-blue-300/70 bg-blue-100/70 text-blue-800 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
          accent: 'border-l-blue-400 dark:border-l-blue-700',
          text: 'text-blue-900 dark:text-blue-100',
          icon: 'text-blue-600 dark:text-blue-400',
          hover: 'hover:bg-blue-50/60 dark:hover:bg-blue-950/20',
        };
    }
  })();

  const formatLabel = (content: string) => {
    const trimmed = String(content ?? '').trim();
    const stripPrefix = (prefix: string) => trimmed.replace(new RegExp(`^${prefix}\\s*:\\s*`, 'i'), '').trim();

    if (comment.markerType === 'question') {
      if (/^question$/i.test(trimmed)) return 'Question';
      return stripPrefix('question');
    }
    if (comment.markerType === 'suggested') {
      if (/^suggested$/i.test(trimmed)) return 'Suggested';
      return stripPrefix('suggested');
    }
    if (comment.markerType === 'digest') {
      if (/^digest$/i.test(trimmed)) return 'Digest';
      return stripPrefix('digest');
    }
    if (comment.markerType === 'note') {
      if (/^note$/i.test(trimmed)) return 'Note';
      return stripPrefix('note');
    }
    if (comment.markerType === 'last_review') {
      if (/^last_review$/i.test(trimmed)) return 'Last review';
      return stripPrefix('last_review');
    }
    if (/^question$/i.test(trimmed)) return 'Question';
    return trimmed;
  };
  const displayContent = formatLabel(comment.content);
  const markerLabel = (() => {
    switch (markerType) {
      case 'question': return 'Question';
      case 'suggested': return 'Suggested';
      case 'digest': return 'Digest';
      case 'note': return 'Note';
      case 'last_review': return 'Last review';
      default: return 'Bot';
    }
  })();
  const shouldHideBodyText =
    String(displayContent || '').trim().toLowerCase() ===
    String(markerLabel || '').trim().toLowerCase();

  const baseClasses =
    variant === 'compact'
      ? `flex items-start gap-2 py-1.5 px-1.5 my-1 rounded border-l-2 overflow-hidden ${markerTone.accent}`
      : `flex items-start gap-2 p-2 my-2 border-l-2 rounded-r ${markerTone.accent}`;
  const hoverClasses = onClick
    ? variant === 'compact'
      ? `cursor-pointer ${markerTone.hover}`
      : `cursor-pointer ${markerTone.hover}`
    : '';

  return (
    <div
      className={`${baseClasses} ${hoverClasses} ${className ?? ''}`}
      onClick={onClick}
      onMouseDown={(e) => {
        if (onClick) {
          e.preventDefault();
          e.stopPropagation();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (!onClick) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      <Bot className={`w-4 h-4 mt-0.5 flex-shrink-0 ${markerTone.icon}`} />
      <div className="flex-1 min-w-0">
        {variant === 'compact' ? (
          <div className="flex items-center gap-2 min-w-0 w-full">
            <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide flex-shrink-0 max-[640px]:hidden ${markerTone.chip}`}>
              {markerLabel}
            </span>
            {!shouldHideBodyText && (
              <span className={`text-sm ${markerTone.text} truncate`} title={displayContent}>
                {displayContent}
              </span>
            )}
            {comment.timestamp && (
              <span className={`inline-flex items-center gap-1 text-[11px] opacity-70 flex-shrink-0 ${markerTone.icon}`}>
                <Clock className="w-3 h-3" />
                {formatRelativeTime(comment.timestamp)}
              </span>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`inline-flex items-center rounded-full border px-1.5 py-0 text-[10px] font-medium uppercase tracking-wide ${markerTone.chip}`}>
                {markerLabel}
              </span>
            </div>
            {!shouldHideBodyText && (
              <div className={`text-sm ${markerTone.text}`}>
                {displayContent}
              </div>
            )}
            {comment.timestamp && (
              <div className={`flex items-center gap-1 mt-1 text-xs opacity-70 ${markerTone.icon}`}>
                <Clock className="w-3 h-3" />
                {formatRelativeTime(comment.timestamp)}
              </div>
            )}
          </>
        )}
      </div>
      {actions && <div className="flex-shrink-0 min-w-0 ml-2">{actions}</div>}
    </div>
  );
}

/**
 * Renders a compact inline bot badge (icon only, with tooltip)
 */
export function BotInlineBadge({ comment }: { comment: BotComment }) {
  const markerType = comment.markerType ?? 'generic';
  const toneClass = (() => {
    switch (markerType) {
      case 'question': return 'text-amber-500 dark:text-amber-400';
      case 'suggested': return 'text-violet-500 dark:text-violet-400';
      case 'digest': return 'text-cyan-500 dark:text-cyan-400';
      case 'note': return 'text-slate-500 dark:text-slate-400';
      case 'last_review': return 'text-emerald-500 dark:text-emerald-400';
      default: return 'text-blue-500 dark:text-blue-400';
    }
  })();

  return (
    <span 
      className={`inline-flex items-center ml-1 p-0.5 ${toneClass} opacity-70 hover:opacity-100`}
      title={comment.timestamp ? `🤖 ${comment.content} (${formatRelativeTime(comment.timestamp)})` : `🤖 ${comment.content}`}
    >
      <Bot className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Renders bot-suggested tasks section with Accept/Reject buttons
 */
export function BotSuggestedSection({ 
  tasks, 
  onAccept, 
  onReject 
}: { 
  tasks: BotSuggestedTask[]; 
  onAccept: (task: BotSuggestedTask) => void;
  onReject: (task: BotSuggestedTask) => void;
}) {
  return (
    <div className="p-3 my-3 bg-base-100 border border-violet-200/80 dark:border-violet-900 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4 text-violet-600 dark:text-violet-400" />
        <h3 className="font-medium text-violet-900 dark:text-violet-100">
          Bot Suggestions
        </h3>
        <span className="text-[11px] px-2 py-0.5 border border-violet-300 dark:border-violet-700 bg-violet-100/70 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 rounded-full">
          {tasks.length}
        </span>
      </div>
      
      <div className="space-y-2">
        {tasks.map((task, index) => (
          <div 
            key={index}
            className="p-2 bg-base-100 border border-base-300/70 rounded"
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {task.text}
                </div>
                {task.description && (
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                    {task.description}
                  </div>
                )}
                <div className="flex items-center gap-1 mt-2 text-xs text-gray-500 dark:text-gray-500">
                  <Clock className="w-3 h-3" />
                  Generated {formatRelativeTime(task.generated)}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button
                  onClick={() => onAccept(task)}
                  className="btn btn-xs btn-success gap-1"
                  title="Accept and add to tasks"
                >
                  <CheckCircle className="w-3 h-3" />
                  Accept
                </button>
                <button
                  onClick={() => onReject(task)}
                  className="btn btn-xs btn-ghost gap-1"
                  title="Reject suggestion"
                >
                  <XCircle className="w-3 h-3" />
                  Reject
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Parses suggested tasks from "Tasks (bot-suggested)" section
 */
export function parseBotSuggestedSection(markdown: string): BotSuggestedTask[] {
  const sectionRegex = /##\s*Tasks\s*\(bot-suggested\)\s*\n(?:<!--\s*bot:\s*suggested\s*-->|<!--\s*Generated\s*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\s*-->)?\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i;
  const match = markdown.match(sectionRegex);
  
  if (!match) return [];
  
  const generatedTime = match[1] || new Date().toISOString();
  const sectionContent = match[2];
  
  // Parse tasks from section
  const taskRegex = /-\s*\[\s*\]\s*(.+?)(?:\n\s*>\s*<!--\s*bot:\s*(.*?)\s*-->)?(?=\n-\s*\[|\n#|$)/g;
  const tasks: BotSuggestedTask[] = [];
  let taskMatch;
  
  while ((taskMatch = taskRegex.exec(sectionContent)) !== null) {
    tasks.push({
      text: taskMatch[1].trim(),
      description: taskMatch[2] ? taskMatch[2].trim() : undefined,
      generated: generatedTime,
    });
  }
  
  return tasks;
}

/**
 * Removes accepted/rejected tasks from the bot-suggested section
 */
export function removeBotSuggestedTask(markdown: string, taskText: string): string {
  // Find the task line and its description (if any)
  const escapedText = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskRegex = new RegExp(
    `-\\s*\\[\\s*\\]\\s*${escapedText}\\s*(?:\\n\\s*>\\s*<!--\\s*bot:.*?-->)?`,
    'g'
  );
  
  return markdown.replace(taskRegex, '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Hook into TaskItem description rendering to show bot comments with special styling
 */
export function enhanceDescriptionWithBot(description: string): {
  hasBotComments: boolean;
  comments: BotComment[];
  cleanDescription: string;
} {
  const normalized = String(description ?? '').replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  const questionLineRegex = /^\s*>\s*(?:\*\*(Question|Suggestion|Follow-up|Clarification|Comment|Reminder):\*\*|(Question|Suggestion|Follow-up|Clarification|Comment|Reminder):|Q:)\s*(.+)$/i;
  const answerLineRegex = /^\s*>\s*(?:\*\*Answer:\*\*|Answer:)\s*(.*)$/i;
  const blockquoteBotRegex = /^\s*>\s*<!--\s*bot:\s*([\s\S]*?)\s*-->\s*(.*)$/i;

  const blockquoteComments: BotComment[] = [];
  const removeLineIndexes = new Set<number>();

  lines.forEach((line, index) => {
    const botMatch = line.match(blockquoteBotRegex);
    if (botMatch) {
      const parsed = parseBotMarkerPayload(botMatch[1]);
      const trailing = String(botMatch[2] ?? '').trim();
      const trailingQuestionText = stripInlineAnswerSuffix(trailing);
      const baseContent = String(parsed.content ?? '').trim();

      let combined = baseContent;
      if (trailing) {
        if (/^question$/i.test(baseContent) || parsed.markerType === 'question') {
          combined = trailingQuestionText || 'Question';
        } else if (/^(digest|note|suggested|last_review)$/i.test(baseContent) || parsed.markerType !== 'generic') {
          combined = `${baseContent}: ${trailing}`;
        } else {
          combined = [baseContent, trailing].filter(Boolean).join(' ').trim();
        }
      }

      blockquoteComments.push({
        content: combined || baseContent,
        timestamp: parsed.timestamp,
        markerType: parsed.markerType,
        source: 'blockquote',
        lineIndex: index,
      });
      removeLineIndexes.add(index);

      const nextLine = lines[index + 1];
      if (nextLine && answerLineRegex.test(nextLine)) {
        removeLineIndexes.add(index + 1);
      }
      return;
    }

    const legacyMatch = line.match(questionLineRegex);
    if (!legacyMatch) return;
    const questionText = (legacyMatch[3] || '').trim();
    if (questionText) {
      blockquoteComments.push({
        content: questionText,
        markerType: 'question',
        source: 'blockquote',
        lineIndex: index,
      });
    }
    removeLineIndexes.add(index);
    const nextLine = lines[index + 1];
    if (nextLine && answerLineRegex.test(nextLine)) {
      removeLineIndexes.add(index + 1);
    }
  });

  const retainedLines = lines.filter((_line, index) => !removeLineIndexes.has(index));
  const retainedText = retainedLines.join('\n');
  const htmlComments = parseBotComments(retainedText);
  const cleanDescription = retainedText
    .replace(/<!--\s*bot:[\s\S]*?-->/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  const comments = [...htmlComments, ...blockquoteComments];

  return {
    hasBotComments: comments.length > 0,
    comments,
    cleanDescription,
  };
}
