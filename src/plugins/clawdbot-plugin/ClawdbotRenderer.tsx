import { Bot, CheckCircle, XCircle, Clock } from 'lucide-react';

export interface ClawdbotComment {
  content: string;
  timestamp?: string;
}

export interface ClawdbotSuggestedTask {
  text: string;
  description?: string;
  generated: string;
}

/**
 * Parses Clawdbot HTML comments from text
 * Format: <!-- Clawdbot: Your insight here -->
 */
export function parseClawdbotComments(text: string): ClawdbotComment[] {
  const regex = /<!--\s*Clawdbot:\s*(.*?)\s*-->/gi;
  const comments: ClawdbotComment[] = [];
  let match;

  while ((match = regex.exec(text)) !== null) {
    const content = match[1].trim();
    
    // Try to extract timestamp if present
    const timestampMatch = content.match(/\((\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\)/);
    const timestamp = timestampMatch ? timestampMatch[1] : undefined;
    const cleanContent = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '') : content;
    
    comments.push({ content: cleanContent, timestamp });
  }

  return comments;
}

/**
 * Extracts inline Clawdbot comments from task text
 * Returns clean text and parsed comments separately
 */
export function extractInlineClawdbotComment(text: string): { 
  cleanText: string; 
  comment: ClawdbotComment | null;
} {
  // Clawdbot markers can appear anywhere in the task text, e.g.
  // "Design mockup <!-- Clawdbot: Added subtask --> #frontend due:2026-02-05"
  // ReactMarkdown will drop HTML comments, so we extract them and show as a badge.

  const regexGlobal = /<!--\s*Clawdbot:\s*([\s\S]*?)\s*-->/gi;
  const comments: ClawdbotComment[] = [];

  const cleanText = text
    .replace(regexGlobal, (_m, rawContent: string) => {
      const content = String(rawContent ?? '').trim();
      const timestampMatch = content.match(/\((\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\)/);
      const timestamp = timestampMatch ? timestampMatch[1] : undefined;
      const cleanContent = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '') : content;
      comments.push({ content: cleanContent, timestamp });
      // Preserve spacing where the comment was.
      return ' ';
    })
    .replace(/\s{2,}/g, ' ')
    .trim();

  return { cleanText, comment: comments[0] ?? null };
}

/**
 * Check if a blockquote contains Clawdbot comment
 */
export function isClawdbotComment(blockquoteText: string): boolean {
  return /<!--\s*Clawdbot:/i.test(blockquoteText);
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
 * Renders a Clawdbot comment with bot icon and styling
 */
export function ClawdbotCommentView({ comment }: { comment: ClawdbotComment }) {
  return (
    <div className="flex items-start gap-2 p-3 my-2 bg-blue-50 dark:bg-blue-950 border-l-4 border-blue-400 dark:border-blue-600 rounded-r">
      <Bot className="w-4 h-4 mt-0.5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm text-blue-900 dark:text-blue-100">
          {comment.content}
        </div>
        {comment.timestamp && (
          <div className="flex items-center gap-1 mt-1 text-xs text-blue-600 dark:text-blue-400 opacity-70">
            <Clock className="w-3 h-3" />
            {formatRelativeTime(comment.timestamp)}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Renders a compact inline Clawdbot badge (icon only, with tooltip)
 */
export function ClawdbotInlineBadge({ comment }: { comment: ClawdbotComment }) {
  return (
    <span 
      className="inline-flex items-center ml-1 p-0.5 text-blue-500 dark:text-blue-400 opacity-70 hover:opacity-100"
      title={comment.timestamp ? `🤖 ${comment.content} (${formatRelativeTime(comment.timestamp)})` : `🤖 ${comment.content}`}
    >
      <Bot className="w-3.5 h-3.5" />
    </span>
  );
}

/**
 * Renders Clawdbot-suggested tasks section with Accept/Reject buttons
 */
export function ClawdbotSuggestedSection({ 
  tasks, 
  onAccept, 
  onReject 
}: { 
  tasks: ClawdbotSuggestedTask[]; 
  onAccept: (task: ClawdbotSuggestedTask) => void;
  onReject: (task: ClawdbotSuggestedTask) => void;
}) {
  return (
    <div className="p-4 my-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        <h3 className="font-semibold text-blue-900 dark:text-blue-100">
          Clawdbot Suggestions
        </h3>
        <span className="text-xs px-2 py-0.5 bg-blue-200 dark:bg-blue-900 text-blue-700 dark:text-blue-300 rounded-full">
          {tasks.length}
        </span>
      </div>
      
      <div className="space-y-3">
        {tasks.map((task, index) => (
          <div 
            key={index}
            className="p-3 bg-white dark:bg-gray-900 border border-blue-100 dark:border-blue-900 rounded"
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
 * Parses suggested tasks from "Tasks (Clawdbot-suggested)" section
 */
export function parseClawdbotSuggestedSection(markdown: string): ClawdbotSuggestedTask[] {
  const sectionRegex = /##\s*Tasks\s*\(Clawdbot-suggested\)\s*\n<!--\s*Generated\s*(\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\s*-->\s*\n([\s\S]*?)(?=\n##\s|\n#\s|$)/i;
  const match = markdown.match(sectionRegex);
  
  if (!match) return [];
  
  const generatedTime = match[1];
  const sectionContent = match[2];
  
  // Parse tasks from section
  const taskRegex = /-\s*\[\s*\]\s*(.+?)(?:\n\s*>\s*<!--\s*Clawdbot:\s*(.*?)\s*-->)?(?=\n-\s*\[|\n#|$)/g;
  const tasks: ClawdbotSuggestedTask[] = [];
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
 * Removes accepted/rejected tasks from the Clawdbot-suggested section
 */
export function removeClawdbotSuggestedTask(markdown: string, taskText: string): string {
  // Find the task line and its description (if any)
  const escapedText = taskText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const taskRegex = new RegExp(
    `-\\s*\\[\\s*\\]\\s*${escapedText}\\s*(?:\\n\\s*>\\s*<!--\\s*Clawdbot:.*?-->)?`,
    'g'
  );
  
  return markdown.replace(taskRegex, '').replace(/\n{3,}/g, '\n\n');
}

/**
 * Hook into TaskItem description rendering to show Clawdbot comments with special styling
 */
export function enhanceDescriptionWithClawdbot(description: string): {
  hasClawdbotComments: boolean;
  comments: ClawdbotComment[];
  cleanDescription: string;
} {
  const comments = parseClawdbotComments(description);
  
  // Remove Clawdbot HTML comments from visible description
  // so they don't render as raw HTML
  const cleanDescription = description.replace(/<!--\s*Clawdbot:.*?-->/gi, '').trim();
  
  return {
    hasClawdbotComments: comments.length > 0,
    comments,
    cleanDescription,
  };
}
