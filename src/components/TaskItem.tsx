import { useState, useEffect, useRef, isValidElement } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import { useSortable } from '@dnd-kit/sortable';
import { useDndContext } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, ChevronDown, ChevronRight, Calendar, AlignLeft, Copy, Check, Link2, Trash2, Bot, X } from 'lucide-react';
import { pluginRegistry } from '../plugins/pluginEngine.tsx';
import type { TaskItemContext } from '../plugins/pluginEngine.tsx';
import type { Task } from '../lib/MarkdownParser';
import { enhanceDescriptionWithBot, BotCommentView, extractInlineBotComment, BotInlineBadge } from '../plugins/bot-plugin/BotPlugin';
import type { BotComment } from '../plugins/bot-plugin/BotPlugin';

interface TaskItemProps {
  task: Task;
  onToggle: (id: string) => void;
  onUpdate?: (id: string, newText: string) => Promise<string | undefined> | void;
  onUpdateDescription?: (id: string, description: string) => void;
  onAnswerBotQuestion?: (taskId: string, comment: string, answer: string, opts?: { archive?: boolean }) => Promise<void>;
  descriptionExpanded?: boolean;
  onDescriptionExpandedChange?: (taskId: string, expanded: boolean) => void;
  onAddNext?: (afterId: string) => void;
  onToggleSection?: (headerId: string) => void;
  sectionCollapsed?: boolean;
  onHeaderEditStart?: (headerId: string) => void;
  onDelete?: (id: string) => void;
  showCompleted: boolean;
  autoFocus?: boolean;
  compact?: boolean;
  fontSize?: 'small' | 'normal' | 'large' | 'xl';
}

export function TaskItem({ task, onToggle, onUpdate, onUpdateDescription, onAnswerBotQuestion, descriptionExpanded, onDescriptionExpandedChange, onAddNext, onToggleSection, sectionCollapsed, onHeaderEditStart, onDelete, showCompleted, autoFocus, compact, fontSize = 'normal' }: TaskItemProps) {
  const [isVisible, setIsVisible] = useState(() => {
    if (task.completed && !showCompleted) return false;
    return true;
  });
  const [isAnimating, setIsAnimating] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  // Strip Clawdbot markers from edit text so users don't see raw HTML comments
  const [editText, setEditText] = useState(() => extractInlineBotComment(task.text).cleanText);
  const [uncontrolledShowDescription, setUncontrolledShowDescription] = useState(false);
  const isShowDescriptionControlled = descriptionExpanded !== undefined;
  const showDescription = isShowDescriptionControlled ? descriptionExpanded : uncontrolledShowDescription;
  const setShowDescription = (value: boolean | ((prev: boolean) => boolean)) => {
    const nextValue = typeof value === 'function' ? value(showDescription) : value;
    if (isShowDescriptionControlled) {
      onDescriptionExpandedChange?.(task.id, nextValue);
    } else {
      setUncontrolledShowDescription(nextValue);
    }
  };
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  // Strip bot markers from description edit text so users don't see raw HTML comments
  const [editDescription, setEditDescription] = useState(() => 
    enhanceDescriptionWithBot(task.description || '').cleanDescription
  );

  // Quick-answer UX for bot questions (without opening full description editor)
  const [activeBotQuestionKey, setActiveBotQuestionKey] = useState<string | null>(null);
  const [activeBotQuestionMarker, setActiveBotQuestionMarker] = useState<string | null>(null);
  const [activeBotQuestionComment, setActiveBotQuestionComment] = useState<BotComment | null>(null);
  const [botAnswerDraft, setBotAnswerDraft] = useState('');
  const [isSavingBotAnswer, setIsSavingBotAnswer] = useState(false);
  const [isBotAnswerEditorOpen, setIsBotAnswerEditorOpen] = useState(false);
  const [justCopied, setJustCopied] = useState(false);
  
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);
  const descriptionRef = useRef<HTMLTextAreaElement>(null);

  const [isPreviewMode, setIsPreviewMode] = useState(false);

  const isRemindersLinked = !!task.reminders;

  // Generic per-task modes for plugins (e.g. Zen Mode)
  const [modes, setModes] = useState<Record<string, boolean>>({});
  const isModeEnabled = (modeId: string) => !!modes[modeId];
  const setModeEnabled = (modeId: string, enabled: boolean) => {
    setModes(prev => ({ ...prev, [modeId]: enabled }));
  };

  // Transient guard to prevent blur handlers from auto-closing while entering special modes
  const [autoCloseGuard, setAutoCloseGuard] = useState(false);
  const guardAutoClose = (ms: number = 200) => {
    setAutoCloseGuard(true);
    setTimeout(() => setAutoCloseGuard(false), ms);
  };

  // Auto-resize description textarea when opening edit mode
  useEffect(() => {
    if (isEditingDescription && descriptionRef.current) {
      descriptionRef.current.style.height = 'auto';
      descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
    }
  }, [isEditingDescription, isPreviewMode]);

  const { over } = useDndContext();
  const isOver = over?.id === task.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 100 : 'auto',
    position: isDragging ? 'relative' as const : undefined,
    marginLeft: `${(task.depth || 0) * 1.5}rem`,
  };

  const requestEdit = () => setIsEditing(true);

  const requestEditDescription = () => {
    setShowDescription(true);
    setIsEditingDescription(true);
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.focus();
        descriptionRef.current.style.height = 'auto';
        descriptionRef.current.style.height = descriptionRef.current.scrollHeight + 'px';
      }
    }, 0);
  };

  // Render drop indicator line
  const DropIndicator = () => {
    if (!isOver || isDragging) return null;
    return (
      <div className="absolute left-0 right-0 h-0.5 bg-primary z-50 pointer-events-none transform -translate-y-1/2 top-0 shadow-[0_0_4px_rgba(var(--p),0.5)]" />
    );
  };

  useEffect(() => {
    if (autoFocus) {
      // Use timeout to avoid synchronous state update warning and ensure render cycle is complete
      const timer = setTimeout(() => setIsEditing(true), 0);
      return () => clearTimeout(timer);
    }
  }, [autoFocus]);

  useEffect(() => {
    if (isEditing) {
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height = inputRef.current.scrollHeight + 'px';
      } else if (headerInputRef.current) {
        headerInputRef.current.focus();
      }
    }
  }, [isEditing]);

  // Exit helper that saves changes then clears states
  const requestExit = async () => {
    if (editText.trim() === '') {
      onDelete?.(task.id);
    } else {
      const originalCleanText = extractInlineBotComment(task.text).cleanText.trim();
      if (editText.trim() !== originalCleanText) {
        const mergedText = mergeTaskTextPreservingInlineBotMarker(editText, task.text);
        await onUpdate?.(task.id, mergedText);
      }
    }
    {
      const originalDesc = task.description || '';
      const originalCleanDesc = enhanceDescriptionWithBot(originalDesc).cleanDescription;
      if (editDescription !== originalCleanDesc) {
        const mergedDesc = mergeDescriptionPreservingBotMarkers(originalDesc, editDescription);
        onUpdateDescription?.(task.id, mergedDesc);
      }
    }
    setIsEditing(false);
    setIsEditingDescription(false);
    setShowDescription(false);
    setModes({});
  };

  const taskItemContext: TaskItemContext = {
    isEditing,
    isEditingDescription,
    showDescription,
    modes: {
      isModeEnabled,
      setModeEnabled,
    },
    descriptionView: {
      view: isPreviewMode ? 'preview' : 'write',
      setView: (view) => setIsPreviewMode(view === 'preview'),
    },
    controls: {
      requestEdit,
      requestEditDescription,
      setShowDescription,
      requestExit: () => { void requestExit(); },
      guardAutoClose,
    },
  };

  const preventAutoClose = pluginRegistry.shouldPreventTaskEditAutoClose(task, taskItemContext);
  const shouldHideDescriptionToggle = pluginRegistry.shouldHideDescriptionToggle(task, taskItemContext);
  const taskItemPluginClassNames = pluginRegistry.getTaskItemClassNames(task, taskItemContext);

  const allTaskActionButtons = pluginRegistry.renderTaskActionButtons(task, taskItemContext);
  const breakdownTaskActionButtons = allTaskActionButtons.filter(
    (node) => isValidElement(node) && (node.props as Record<string, unknown>)?.['data-task-action'] === 'breakdown'
  );
  const inlineTaskActionButtons = allTaskActionButtons.filter(
    (node) => !(isValidElement(node) && (node.props as Record<string, unknown>)?.['data-task-action'] === 'breakdown')
  );

  useEffect(() => {
    if (task.completed && !showCompleted) {
      // If already hidden (initial render case handled by useState), don't animate
      if (!isVisible) return;

      // Start exit animation
      const timer = setTimeout(() => {
        setIsAnimating(true);
        // Wait for animation to finish before hiding
        setTimeout(() => setIsVisible(false), 500); 
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      // Reset immediately if uncompleted or showCompleted is true
      // We use a timeout of 0 to avoid synchronous state updates during render
      const timer = setTimeout(() => {
        setIsVisible(true);
        setIsAnimating(false);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [task.completed, showCompleted]);

  useEffect(() => {
    const { cleanText } = extractInlineBotComment(task.text);
    if (cleanText !== editText && !isEditing) {
      setEditText(cleanText);
    }
  }, [task.text, editText, isEditing]);

  useEffect(() => {
    if (!isEditingDescription) {
      setEditDescription(enhanceDescriptionWithBot(task.description || '').cleanDescription);
    }
  }, [task.description, isEditingDescription]);

  const getBotCommentKey = (comment: BotComment) => {
    return `${comment.source ?? ''}|${comment.timestamp ?? ''}|${comment.lineIndex ?? ''}|${comment.content}`;
  };

  const isBotQuestion = (comment: { content: string }) => {
    const c = String(comment.content || '').trim();
    return /^(question|suggestion|follow-up|clarification|comment|reminder)\s*:/i.test(c) || /^q\s*:/i.test(c) || c.endsWith('?');
  };

  const isBlockquoteComment = (comment: BotComment | null) => {
    return comment?.source === 'blockquote' && typeof comment.lineIndex === 'number';
  };

  const formatBotMarker = (comment: BotComment) => {
    if (comment.source === 'blockquote') return null;
    const inner = comment.timestamp ? `${comment.content} (${comment.timestamp})` : comment.content;
    return `<!-- bot: ${inner} -->`;
  };

  const findInlineAnswerForTaskText = (taskText: string, comment: BotComment) => {
    if (comment.source !== 'inline') return null;
    const marker = formatBotMarker(comment);
    if (!marker) return null;
    const idx = taskText.indexOf(marker);
    if (idx === -1) return null;
    const tail = taskText.slice(idx + marker.length);
    const m = tail.match(/Answer\s*:\s*([^\n]*)/i);
    return m ? String(m[1] || '').trim() : null;
  };

  const upsertInlineAnswerInTaskText = (taskText: string, comment: BotComment, answer: string) => {
    if (comment.source !== 'inline') return taskText;
    const marker = formatBotMarker(comment);
    if (!marker) return taskText;
    const idx = taskText.indexOf(marker);
    if (idx === -1) return taskText;

    const before = taskText.slice(0, idx + marker.length);
    const after = taskText.slice(idx + marker.length);
    const updatedAfter = after.replace(/\s*Answer\s*:\s*[^\n]*\s*$/i, '').trimEnd();
    const spacer = updatedAfter.length > 0 ? ` ${updatedAfter}` : '';
    return `${before}${spacer} Answer: ${answer}`;
  };

  const removeInlineBotMarkerFromText = (taskText: string, comment: BotComment) => {
    if (comment.source !== 'inline') return taskText;
    const marker = formatBotMarker(comment);
    if (!marker) return taskText;
    const idx = taskText.indexOf(marker);
    if (idx === -1) return taskText;

    const before = taskText.slice(0, idx).trimEnd();
    const after = taskText.slice(idx + marker.length);
    const cleanedAfter = after.replace(/\s*Answer\s*:\s*[^\n]*\s*$/i, '').trimStart();
    return [before, cleanedAfter].filter(Boolean).join(' ').replace(/\s{2,}/g, ' ').trim();
  };

  const mergeTaskTextPreservingInlineBotMarker = (cleanText: string, originalTaskText: string) => {
    if (/<!--\s*bot:/i.test(cleanText)) return cleanText;
    const { comment } = extractInlineBotComment(originalTaskText);
    if (!comment) return cleanText;
    const marker = formatBotMarker(comment);
    const needsSpace = !cleanText.endsWith(' ') && cleanText.length > 0;
    return `${cleanText}${needsSpace ? ' ' : ''}${marker}`;
  };

  const mergeDescriptionPreservingBotMarkers = (originalDescription: string, editedCleanDescription: string) => {
    if (/<!--\s*bot:/i.test(editedCleanDescription)) return editedCleanDescription;

    const markers = originalDescription.match(/<!--\s*bot:[\s\S]*?-->/gi) || [];
    if (markers.length === 0) return editedCleanDescription;

    const clean = editedCleanDescription.trimEnd();
    if (!clean) return `${markers.join('\n')}`;
    return `${clean}\n\n${markers.join('\n')}`;
  };

  const insertAnswerAfterBotComment = (originalDescription: string, comment: BotComment, answer: string) => {
    const raw = String(originalDescription || '');
    const normalizedAnswer = String(answer || '').trim();
    if (!normalizedAnswer) return raw;

    if (comment.source === 'blockquote' && typeof comment.lineIndex === 'number') {
      const lines = raw.split('\n');
      const index = comment.lineIndex;
      if (index < 0 || index >= lines.length) return raw;

      const answerLineRegex = /^\s*>\s*(?:\*\*Answer:\*\*|Answer:)\s*(.*)$/i;
      const nextLine = lines[index + 1];
      const answerLine = `> **Answer:** ${normalizedAnswer}`;

      if (nextLine && answerLineRegex.test(nextLine)) {
        lines[index + 1] = answerLine;
      } else {
        lines.splice(index + 1, 0, answerLine);
      }

      return lines.join('\n');
    }

    const botRe = /<!--\s*bot:\s*([\s\S]*?)\s*-->/gi;
    let match: RegExpExecArray | null;

    const normalizeMarkerContent = (rawContent: string) => {
      const content = String(rawContent ?? '').trim();
      const timestampMatch = content.match(/\((\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\)/);
      const timestamp = timestampMatch ? timestampMatch[1] : undefined;
      const cleanContent = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '') : content;
      return { cleanContent: cleanContent.trim(), timestamp };
    };

    while ((match = botRe.exec(raw)) !== null) {
      const markerContent = match[1];
      const start = match.index;
      const end = start + match[0].length;

      const normalized = normalizeMarkerContent(markerContent);
      const targetContent = String(comment.content || '').trim();
      const targetTimestamp = comment.timestamp;

      if (normalized.cleanContent === targetContent && normalized.timestamp === targetTimestamp) {
        // Keep the answer on the SAME LINE as the marker so we don't change
        // line counts (task IDs are line-number derived).
        const lineEnd = raw.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? raw.length : lineEnd;
        const tail = raw.slice(end, actualLineEnd);

        const answerRe = /(\s*Answer\s*:\s*)([^\n]*)/i;
        const replacementTail = answerRe.test(tail)
          ? tail.replace(answerRe, `$1${normalizedAnswer}`)
          : `${tail}${tail.trim().length === 0 ? ' ' : ' '}Answer: ${normalizedAnswer}`;

        return `${raw.slice(0, end)}${replacementTail}${raw.slice(actualLineEnd)}`;
      }
    }

    // Fallback: append as a normal line (may affect line numbers; avoid if possible)
    const base = raw.trimEnd();
    return `${base}${base ? '\n' : ''}Answer: ${normalizedAnswer}`;
  };

  const findInlineAnswerForBotComment = (originalDescription: string, comment: BotComment) => {
    const raw = String(originalDescription || '');

    if (comment.source === 'blockquote' && typeof comment.lineIndex === 'number') {
      const lines = raw.split('\n');
      const index = comment.lineIndex;
      if (index < 0 || index >= lines.length) return null;
      const nextLine = lines[index + 1] || '';
      const m = nextLine.match(/^\s*>\s*(?:\*\*Answer:\*\*|Answer:)\s*(.*)$/i);
      return m ? String(m[1] || '').trim() : null;
    }

    const botRe = /<!--\s*bot:\s*([\s\S]*?)\s*-->/gi;
    let match: RegExpExecArray | null;

    const normalizeMarkerContent = (rawContent: string) => {
      const content = String(rawContent ?? '').trim();
      const timestampMatch = content.match(/\((\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\)/);
      const timestamp = timestampMatch ? timestampMatch[1] : undefined;
      const cleanContent = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '') : content;
      return { cleanContent: cleanContent.trim(), timestamp };
    };

    while ((match = botRe.exec(raw)) !== null) {
      const markerContent = match[1];
      const start = match.index;
      const end = start + match[0].length;

      const normalized = normalizeMarkerContent(markerContent);
      const targetContent = String(comment.content || '').trim();
      const targetTimestamp = comment.timestamp;

      if (normalized.cleanContent === targetContent && normalized.timestamp === targetTimestamp) {
        const lineEnd = raw.indexOf('\n', end);
        const actualLineEnd = lineEnd === -1 ? raw.length : lineEnd;
        const tail = raw.slice(end, actualLineEnd);
        const m = tail.match(/Answer\s*:\s*([^\n]*)/i);
        return m ? String(m[1] || '').trim() : null;
      }
    }
    return null;
  };

  const openBotAnswerModal = (
    key: string,
    marker: string | null,
    comment: BotComment,
    existingAnswer: string | null
  ) => {
    setActiveBotQuestionKey(key);
    setActiveBotQuestionMarker(marker);
    setActiveBotQuestionComment(comment);
    setBotAnswerDraft(existingAnswer || '');
    setIsBotAnswerEditorOpen(true);
  };

  const closeBotAnswerModal = () => {
    setIsBotAnswerEditorOpen(false);
    setActiveBotQuestionKey(null);
    setActiveBotQuestionMarker(null);
    setActiveBotQuestionComment(null);
    setBotAnswerDraft('');
  };

  const removeBotCommentFromDescription = (
    originalDescription: string,
    comment: BotComment
  ) => {
    const raw = String(originalDescription || '');

    if (comment.source === 'blockquote' && typeof comment.lineIndex === 'number') {
      const lines = raw.split('\n');
      const index = comment.lineIndex;
      if (index < 0 || index >= lines.length) return raw;

      const answerLineRegex = /^\s*>\s*(?:\*\*Answer:\*\*|Answer:)\s*(.*)$/i;
      const removeIndexes = new Set<number>([index]);
      const nextLine = lines[index + 1];
      if (nextLine && answerLineRegex.test(nextLine)) {
        removeIndexes.add(index + 1);
      }

      const nextLines = lines.filter((_line, lineIndex) => !removeIndexes.has(lineIndex));
      return nextLines.join('\n');
    }
    const botRe = /<!--\s*bot:\s*([\s\S]*?)\s*-->/gi;
    let match: RegExpExecArray | null;

    const normalizeMarkerContent = (rawContent: string) => {
      const content = String(rawContent ?? '').trim();
      const timestampMatch = content.match(/\((\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:Z)?)\)/);
      const timestamp = timestampMatch ? timestampMatch[1] : undefined;
      const cleanContent = timestamp ? content.replace(/\s*\([^)]+\)\s*$/, '') : content;
      return { cleanContent: cleanContent.trim(), timestamp };
    };

    while ((match = botRe.exec(raw)) !== null) {
      const markerContent = match[1];
      const markerStart = match.index;
      const markerEnd = markerStart + match[0].length;
      const normalized = normalizeMarkerContent(markerContent);
      const targetContent = String(comment.content || '').trim();
      const targetTimestamp = comment.timestamp;

      if (normalized.cleanContent === targetContent && normalized.timestamp === targetTimestamp) {
        const lineStart = raw.lastIndexOf('\n', markerStart - 1);
        const actualLineStart = lineStart === -1 ? 0 : lineStart + 1;
        const lineEnd = raw.indexOf('\n', markerEnd);
        const actualLineEnd = lineEnd === -1 ? raw.length : lineEnd;

        const line = raw.slice(actualLineStart, actualLineEnd);
        const lineWithoutMarker = line
          .replace(match[0], '')
          .replace(/\s*Answer\s*:\s*[^\n]*/i, '');

        if (lineWithoutMarker.trim().length === 0) {
          const cutEnd = lineEnd === -1 ? raw.length : lineEnd + 1;
          return `${raw.slice(0, actualLineStart)}${raw.slice(cutEnd)}`.replace(/\n{3,}/g, '\n\n').trimEnd();
        }

        return `${raw.slice(0, actualLineStart)}${lineWithoutMarker}${raw.slice(actualLineEnd)}`
          .replace(/\n{3,}/g, '\n\n')
          .trimEnd();
      }
    }

    return raw;
  };

  const saveBotAnswer = async (archive: boolean) => {
    const trimmed = botAnswerDraft.trim();
    if (!trimmed || !activeBotQuestionComment) return;
    try {
      setIsSavingBotAnswer(true);
      if (activeBotQuestionComment.source === 'inline' && onUpdate) {
        const nextText = upsertInlineAnswerInTaskText(task.text, activeBotQuestionComment, trimmed);
        await Promise.resolve(onUpdate(task.id, nextText));
        closeBotAnswerModal();
        return;
      }
      if (onAnswerBotQuestion && activeBotQuestionMarker && !isBlockquoteComment(activeBotQuestionComment)) {
        await onAnswerBotQuestion(task.id, activeBotQuestionMarker, trimmed, { archive });
      } else if (onUpdateDescription) {
        const originalDesc = task.description || '';
        const nextDesc = insertAnswerAfterBotComment(originalDesc, activeBotQuestionComment, trimmed);
        await Promise.resolve(onUpdateDescription(task.id, nextDesc));
      }
      closeBotAnswerModal();
    } finally {
      setIsSavingBotAnswer(false);
    }
  };

  if (!isVisible) return null;

  const enhancedDescription = enhanceDescriptionWithBot(task.description || '');
  const inlineBotComment = extractInlineBotComment(task.text).comment;
  const inlineQuestionComment = inlineBotComment && isBotQuestion(inlineBotComment) ? inlineBotComment : null;
  const hasBotQuestion =
    enhancedDescription.comments.some((comment) => isBotQuestion(comment)) ||
    (inlineBotComment ? isBotQuestion(inlineBotComment) : false);

  const handleCopy = async () => {
    const checkbox = task.completed ? '- [x] ' : '- [ ] ';
    const text = task.text;
    // Indent description and add blockquote marker to match parser expectations
    const description = task.description ? `\n${task.description.split('\n').map(line => `  > ${line}`).join('\n')}` : '';
    const copyText = `${checkbox}${text}${description}`;
    
    try {
      await navigator.clipboard.writeText(copyText);
      setJustCopied(true);
      setTimeout(() => setJustCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.metaKey || e.ctrlKey) {
        // Cmd+Enter or Ctrl+Enter to toggle description editing
        e.preventDefault();
        setIsEditing(false);
        setShowDescription(true);
        setIsEditingDescription(true);
        // Wait for render
        setTimeout(() => {
          if (descriptionRef.current) {
            descriptionRef.current.focus();
          }
        }, 0);
        return;
      }
      
      if (e.shiftKey) {
        // Allow default behavior (newline)
        return;
      }
      
      e.preventDefault(); // Prevent newline (submit)
      
      let currentId = task.id;
      {
        const originalCleanText = extractInlineBotComment(task.text).cleanText.trim();
        if (editText.trim() !== originalCleanText) {
          const mergedText = mergeTaskTextPreservingInlineBotMarker(editText, task.text);
          const newId = await onUpdate?.(task.id, mergedText);
          if (newId) currentId = newId;
        }
      }
      setIsEditing(false);
      onAddNext?.(currentId);
    } else if (e.key === 'Escape') {
      if (preventAutoClose) {
        e.preventDefault();
        await requestExit();
        return;
      }
      {
        setIsEditing(false);
        setEditText(extractInlineBotComment(task.text).cleanText);
      }
    } else if (e.key === 'Backspace' && editText === '') {
      e.preventDefault();
      onDelete?.(task.id);
    }
  };

  const handleDescriptionKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setIsEditingDescription(false);
      // Reset to clean description without bot markers
      setEditDescription(enhanceDescriptionWithBot(task.description || '').cleanDescription);
    }
  };

  const handleDescriptionBlur = (e: React.FocusEvent) => {
    if (autoCloseGuard) return;
    // Check if focus is moving to the title input
    if (e.relatedTarget && (e.relatedTarget === inputRef.current || e.relatedTarget === headerInputRef.current)) {
      return;
    }

    // If focus is moving to any element inside the Zen Mode controls or inside the current task element,
    // do not treat it as a blur that should close editing while in Zen Mode. This prevents clicks below
    // the description (e.g., toolbar controls) from closing the modal.
    if (e.relatedTarget instanceof Element) {
      if (e.relatedTarget.closest('.zen-controls')) return;
      // If clicking somewhere inside THIS task's node (which includes the expanded description), keep editing
      const relatedTaskItem = e.relatedTarget.closest('.task-item');
      if (relatedTaskItem && relatedTaskItem.getAttribute('data-task-id') === task.id) return;
    }

    // If any plugin requests preventing auto-close, do not close on blur.
    if (preventAutoClose) {
      return;
    }

    {
      const originalDesc = task.description || '';
      const originalCleanDesc = enhanceDescriptionWithBot(originalDesc).cleanDescription;
      if (editDescription !== originalCleanDesc) {
        const mergedDesc = mergeDescriptionPreservingBotMarkers(originalDesc, editDescription);
        onUpdateDescription?.(task.id, mergedDesc);
      }
    }
    setIsEditingDescription(false);
    // Also close title edit if we are leaving the task completely
    setIsEditing(false);
    setShowDescription(false);
  };

  const handleAddDueDate = () => {
    // Simple implementation: append due:YYYY-MM-DD if not present
    if (!editText.includes('due:')) {
      const today = new Date().toISOString().split('T')[0];
      setEditText(prev => `${prev} due:${today}`);
      // Keep editing focus
      if (inputRef.current) {
        inputRef.current.focus();
      }
    }
  };

  const handleToggleDescriptionEdit = () => {
    // Keep title editing active for unified edit mode
    // setIsEditing(false); 
    setShowDescription(true);
    setIsEditingDescription(true);
    setTimeout(() => {
      if (descriptionRef.current) {
        descriptionRef.current.focus();
      }
    }, 0);
  };

  const handleBlur = (e: React.FocusEvent) => {
    if (autoCloseGuard) return;
    // Check if focus is moving to the description input
    if (e.relatedTarget && e.relatedTarget === descriptionRef.current) {
      return;
    }

    // If focus is moving to any element inside the Zen Mode controls or staying within the task-item, ignore.
    if (e.relatedTarget instanceof Element) {
      if (e.relatedTarget.closest('.zen-controls')) return;
      const relatedTaskItem = e.relatedTarget.closest('.task-item');
      if (relatedTaskItem && relatedTaskItem.getAttribute('data-task-id') === task.id) return;
    }

    // If any plugin requests preventing auto-close, do not close on blur.
    if (preventAutoClose) {
      return;
    }

    if (editText.trim() === '') {
      onDelete?.(task.id);
    } else {
      const originalCleanText = extractInlineBotComment(task.text).cleanText.trim();
      if (editText.trim() !== originalCleanText) {
        const mergedText = mergeTaskTextPreservingInlineBotMarker(editText, task.text);
        onUpdate?.(task.id, mergedText);
      }
    }
    setIsEditing(false);
    // Also close description edit if we are leaving
    setIsEditingDescription(false);
    setShowDescription(false);
  };

  // Helper to clean text for display (remove plugin syntax like due:YYYY-MM-DD)
  const getDisplayText = (text: string) => {
    let processed = text.replace(/due:\d{4}-\d{2}-\d{2}/g, '').trim();
    processed = processed.replace(/\s*Answer\s*:\s*[^\n]*$/i, '').trim();
    
    // Explicitly handle <url> syntax to ensure it renders as a link
    // We need to be careful not to double-linkify if it's already [url](url)
    // But <url> is distinct.
    processed = processed.replace(/<(https?:\/\/[^>]+)>/g, '[$1]($1)');

    // Also handle plain URLs that might have been passed through (e.g. if parser didn't wrap them)
    // But avoid matching inside existing markdown links [text](url) or <url> (if any left)
    // This regex is tricky. A safer way is to let ReactMarkdown handle plain URLs via remark-gfm.
    // BUT, if we want to ensure they are clickable even if remark-gfm misses them (unlikely for standard URLs),
    // we can leave them.
    // The issue "nothing is show" suggests that maybe the text is empty?
    // If text is just "<https://...>", processed becomes "[https://...](https://...)"
    
    // Tag processing: Replace #tag with link format for custom rendering

    // Tag processing: Replace #tag with link format for custom rendering
    // But ignore \#tag (escaped)
    processed = processed.replace(/(?<!\\)#([a-zA-Z0-9_]+)/g, '[#$1](tag:$1)');
    
    // Unescape \# to #
    processed = processed.replace(/\\#/g, '#');

    // Auto-linkify domains without protocol (e.g. google.com)
    // Matches common TLDs, avoids existing links or protocols
    const urlRegex = /(^|\s)(?!https?:\/\/)(?!\[)((?:www\.|[\w-]+\.)+(?:com|org|net|io|gov|edu|co|me|app|dev|xyz))(?=\s|$)/gi;
    
    processed = processed.replace(urlRegex, (_match, prefix, url) => {
      return `${prefix}[${url}](https://${url})`;
    });

    return processed;
  };

  // Helper to get font size class
  const getFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-xs';
      case 'normal': return 'text-sm';
      case 'large': return 'text-base';
      case 'xl': return 'text-lg';
      default: return 'text-base';
    }
  };

  const getCheckboxSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'w-4 h-4';
      case 'normal': return 'w-5 h-5';
      case 'large': return 'w-5 h-5';
      case 'xl': return 'w-6 h-6';
      default: return 'w-5 h-5';
    }
  };

  const getLineHeightClass = () => {
    switch (fontSize) {
      case 'small': return 'h-4'; // leading-4
      case 'normal': return 'h-5'; // leading-5
      case 'large': return 'h-6'; // leading-6
      case 'xl': return 'h-7'; // leading-7
      default: return 'h-6';
    }
  };

  const getHeaderFontSizeClass = () => {
    switch (fontSize) {
      case 'small': return 'text-lg';
      case 'normal': return 'text-xl';
      case 'large': return 'text-2xl';
      case 'xl': return 'text-3xl';
      default: return 'text-xl';
    }
  };

  if (task.type === 'header') {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        data-task-id={task.id}
        className={`
          task-item group flex items-center gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
          ${compact ? 'p-1 pt-2' : 'p-3 pt-6'}
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
          ${isEditing ? 'is-editing' : ''}
        `}
      >
        <DropIndicator />
        <div {...attributes} {...listeners} className="drag-handle cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>

        <button
          onClick={() => onToggleSection?.(task.id)}
          className="btn btn-ghost btn-xs btn-square text-base-content/50 hover:text-primary"
          title={sectionCollapsed ? 'Expand section' : 'Collapse section'}
        >
          {sectionCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
        </button>

        {isEditing ? (
          <input
            ref={headerInputRef}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onFocus={() => onHeaderEditStart?.(task.id)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            className={`flex-1 bg-transparent border-none outline-none font-bold text-base-content p-0 ${getHeaderFontSizeClass()}`}
          />
        ) : (
          <h2 
            onMouseDown={(e) => {
              e.preventDefault();
              onHeaderEditStart?.(task.id);
              setModes({});
              setIsEditing(true);
            }}
            className={`font-bold text-base-content flex-1 cursor-text ${getHeaderFontSizeClass()}`}
          >
            {(() => {
              // Check if header has inline Clawdbot comment
              const { cleanText, comment } = extractInlineBotComment(task.text);
              return (
                <>
                  {getDisplayText(cleanText)}
                  {comment && <BotInlineBadge comment={comment} />}
                </>
              );
            })()}
          </h2>
        )}
        <button 
          onClick={() => onAddNext?.(task.id)}
          className="btn btn-ghost btn-xs btn-circle opacity-0 group-hover:opacity-100 transition-opacity text-base-content/40 hover:text-primary"
          title="Add task to section"
        >
          <Plus size={16} />
        </button>
      </div>
    );
  }

  if (task.type === 'empty') {
    return (
      <div 
        ref={setNodeRef}
        style={style}
        onClick={() => setIsEditing(true)}
        className={`
          task-item group flex items-center gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
          ${compact ? 'p-0.5' : 'p-2'}
          ${isDragging ? 'opacity-50 bg-base-200' : ''}
          ${isEditing ? 'is-editing' : ''}
        `}
      >
        <DropIndicator />
        <div {...attributes} {...listeners} className="drag-handle cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
          <GripVertical size={16} />
        </div>
        {isEditing ? (
          <textarea
            ref={inputRef}
            value={editText}
            onChange={(e) => {
              setEditText(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = e.target.scrollHeight + 'px';
            }}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            rows={1}
            className={`flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal ${getFontSizeClass()}`}
            autoFocus
          />
        ) : (
          <div className="h-4 flex-1 cursor-text"></div>
        )}
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef}
      style={style}
      data-task-id={task.id}
      className={`
        task-item group flex items-start gap-3 border-b border-base-300 last:border-none transition-all duration-500 ease-in-out relative
        ${compact ? 'p-1' : 'p-3'}
        ${isAnimating ? 'opacity-0 -translate-y-4 max-h-0 overflow-hidden py-0 border-none' : 'opacity-100 max-h-[2000px]'}
        ${isDragging ? 'opacity-50 bg-base-200' : ''}
        ${(isEditing || isEditingDescription) ? 'is-editing' : ''}
        ${taskItemPluginClassNames.join(' ')}
      `}
    >
      <DropIndicator />
      <div {...attributes} {...listeners} className={`drag-handle cursor-grab active:cursor-grabbing text-base-content/20 hover:text-base-content/50 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex items-center justify-center ${getLineHeightClass()}`}>
        <GripVertical size={16} />
      </div>

      <div className={`flex items-center justify-center flex-shrink-0 ${getLineHeightClass()}`}>
        <button 
          onClick={() => onToggle(task.id)}
          className="transition-colors p-0 rounded-full hover:bg-base-200 group/checkbox"
        >
          {task.completed ? (
            <div className={`${getCheckboxSizeClass()} rounded-full border-2 border-base-content/30 bg-base-content/30`}></div>
          ) : (
            <div className={`${getCheckboxSizeClass()} rounded-full border-2 border-base-content/50 group-hover/checkbox:border-primary`}></div>
          )}
        </button>
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 relative">
          {isEditing ? (
            <div className="w-full">
              <textarea
                ref={inputRef}
                value={editText}
                onChange={(e) => {
                  setEditText(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = e.target.scrollHeight + 'px';
                }}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                rows={1}
                className={`flex-1 bg-transparent border-none outline-none text-base-content font-medium p-0 resize-none overflow-hidden leading-normal w-full ${getFontSizeClass()}`}
              />
              {/* Action Bar */}
              <div className="flex gap-2 mt-2">
                {!isEditingDescription && (
                <button 
                  onMouseDown={(e) => { e.preventDefault(); handleToggleDescriptionEdit(); }}
                  className="btn btn-xs btn-ghost gap-1 text-base-content/60 font-normal"
                >
                  <AlignLeft size={12} /> Add Details
                </button>
                )}
                <button 
                  onMouseDown={(e) => { e.preventDefault(); handleAddDueDate(); }}
                  className="btn btn-xs btn-ghost gap-1 text-base-content/60 font-normal"
                >
                  <Calendar size={12} /> Due Date
                </button>

                {onDelete && (
                  <button
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDelete(task.id);
                    }}
                    className="btn btn-xs btn-ghost gap-1 text-base-content/60 font-normal hover:text-error"
                    title="Delete task"
                    aria-label="Delete task"
                  >
                    <Trash2 size={12} /> Delete
                  </button>
                )}

                {breakdownTaskActionButtons.length > 0 && (
                  <div className="flex items-center gap-1">
                    {breakdownTaskActionButtons.map((node, idx) => (
                      <span
                        key={idx}
                        className="[&>button]:!bg-primary/10 [&>button]:!text-primary [&>button]:!border [&>button]:!border-primary/20 [&>button]:hover:!bg-primary/20 [&>button]:hover:!border-primary/30 [&>button]:!shadow-none"
                      >
                        {node}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div
              onMouseDown={(e) => {
                const el = e.target instanceof Element ? e.target : null;
                if (el?.closest('a')) return;
                e.preventDefault();
                setModes({});
                // Clicking a task should open its details panel too.
                setShowDescription(true);
                setIsEditing(true);
              }}
              className={`flex-1 break-words cursor-text prose prose-sm max-w-none min-h-[1.5em] pr-8 flex items-center gap-1 flex-wrap ${task.completed ? 'line-through text-base-content/30' : 'text-base-content'} ${compact ? 'leading-snug' : ''} ${getFontSizeClass()}`}
            >
              <span className="flex-1 min-w-0">
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkBreaks]} 
                  components={{ 
                    p: ({children}) => <span className="m-0 p-0">{children}</span>,
                    // eslint-disable-next-line @typescript-eslint/no-unused-vars
                    a: ({node, ...props}) => {
                      const href = props.href || '';
                      if (href.startsWith('tag:')) {
                        const tag = href.replace('tag:', '');
                        return (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-primary/10 text-primary mx-0.5 select-none">
                            #{tag}
                          </span>
                        );
                      }
                      return (
                        <a 
                          {...props} 
                          target="_blank" 
                          rel="noopener noreferrer" 
                          className="text-primary hover:underline cursor-pointer relative z-10"
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()} 
                        />
                      );
                    }
                  }}
                >
                  {(() => {
                    const { cleanText } = extractInlineBotComment(task.text);
                    return getDisplayText(cleanText);
                  })()}
                </ReactMarkdown>
              </span>
              {(() => {
                const { comment } = extractInlineBotComment(task.text);
                return comment ? <BotInlineBadge comment={comment} /> : null;
              })()}
              {hasBotQuestion && !inlineBotComment && (
                <span
                  className="inline-flex items-center ml-1 text-blue-500 dark:text-blue-400 opacity-80"
                  title="Bot question"
                  aria-label="Bot question"
                >
                  <Bot className="w-3.5 h-3.5" />
                </span>
              )}
            </div>
          )}

          {isRemindersLinked && (
            <span
              className="flex items-center text-base-content/40"
              title="Linked to Reminders"
              aria-label="Linked to Reminders"
            >
              <Link2 size={14} />
            </span>
          )}
          
          {/* Plugin Extensions (rendered further down with exit handler) */}

          {/* Hover Actions (positioned so hover doesn't reflow text) */}
          {(inlineTaskActionButtons.length > 0 || true) && (
            <div
              className={`absolute top-0 ${((task.description || isEditingDescription) && !shouldHideDescriptionToggle) ? 'right-8' : 'right-0'} hidden group-hover:flex group-focus-within:flex items-center gap-1 bg-base-100/90 rounded-lg px-1`}
            >
              {inlineTaskActionButtons.map((node, idx) => (
                <span key={idx}>{node}</span>
              ))}

              <button
                onClick={handleCopy}
                className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-primary"
                title="Copy task and description"
              >
                {justCopied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          )}

          {/* Description Toggle */}
          {(task.description || isEditingDescription) && !shouldHideDescriptionToggle && (
            <button 
              onMouseDown={(e) => e.preventDefault()}
              onClick={(e) => {
                // Toggle description visibility but do NOT exit Zen Mode.
                // Prevent click from blurring inputs when in Zen Mode.
                e.stopPropagation();
                setShowDescription(prev => !prev);
                // If entering the description view while editing, keep description edit active
                if (!showDescription && isEditing) {
                  setIsEditingDescription(true);
                }
              }}
              className={`btn btn-ghost btn-xs btn-circle ${showDescription ? 'text-primary' : 'text-base-content/40'}`}
            >
              {showDescription ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            </button>
          )}
        </div>

        {inlineQuestionComment && (
          <div
            className="mt-2 ml-1 bot-qa"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const key = getBotCommentKey(inlineQuestionComment);
              const existingAnswer = findInlineAnswerForTaskText(task.text, inlineQuestionComment);
              const isActiveQuestion = isBotAnswerEditorOpen && activeBotQuestionKey === key;

              return (
                <>
                  <BotCommentView
                    comment={inlineQuestionComment}
                    onClick={() =>
                      openBotAnswerModal(
                        key,
                        formatBotMarker(inlineQuestionComment),
                        inlineQuestionComment,
                        existingAnswer
                      )
                    }
                    className="bot-comment"
                    variant="compact"
                    actions={
                      onUpdate ? (
                        <button
                          className="btn btn-xs btn-square btn-ghost"
                          title="Remove question"
                          aria-label="Remove question"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                          }}
                          onClick={async (e) => {
                            e.stopPropagation();
                            const nextText = removeInlineBotMarkerFromText(task.text, inlineQuestionComment);
                            await Promise.resolve(onUpdate(task.id, nextText));
                            if (activeBotQuestionKey === key) closeBotAnswerModal();
                          }}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : null
                    }
                  />

                  {isActiveQuestion && (
                    <div className="ml-7 mt-1">
                      <div className="mt-1 bg-base-200/50 rounded p-2">
                        <textarea
                          autoFocus
                          value={botAnswerDraft}
                          onChange={(e) => setBotAnswerDraft(e.target.value)}
                          rows={2}
                          placeholder="Type your answer…"
                            className="textarea textarea-bordered w-full text-sm min-h-[2.5rem]"
                          disabled={isSavingBotAnswer}
                          onKeyDown={async (e) => {
                            if (e.key === 'Escape') {
                              e.preventDefault();
                              closeBotAnswerModal();
                              return;
                            }
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              await saveBotAnswer(false);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Description Area */}
        {(showDescription || isEditingDescription) && (
          <div className="mt-2 pl-1">
            {isEditingDescription ? (
              <div className="flex flex-col gap-2">
                {enhancedDescription.comments.length > 0 && (
                  <div>
                    {enhancedDescription.comments.map((comment) => {
                      const key = getBotCommentKey(comment);
                      const question = isBotQuestion(comment);
                      const existingAnswer = question
                        ? findInlineAnswerForBotComment(task.description || '', comment)
                        : null;

                      return (
                        <div key={key} className="mb-2">
                          <BotCommentView
                            comment={comment}
                            onClick={
                              question
                                ? () => openBotAnswerModal(key, formatBotMarker(comment), comment, existingAnswer)
                                : undefined
                            }
                            className={question ? 'bot-comment' : undefined}
                            variant={question ? 'compact' : 'default'}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
                {pluginRegistry.renderDescriptionToolbars(task, taskItemContext).length > 0 && (
                  <div className="flex justify-end mb-1">
                    {pluginRegistry.renderDescriptionToolbars(task, taskItemContext).map((node, idx) => (
                      <span key={idx}>{node}</span>
                    ))}
                  </div>
                )}
                
                {isPreviewMode ? (
                  <div className="w-full bg-base-200/30 rounded p-4 text-sm text-base-content/80 min-h-[100px] prose prose-sm max-w-none">
                    <ReactMarkdown 
                      remarkPlugins={[remarkGfm, remarkBreaks]}
                      components={{
                        p: ({children}) => <span className="block mb-2 last:mb-0">{children}</span>,
                        a: ({node, ...props}) => <a {...props} className="text-primary hover:underline" target="_blank" rel="noopener noreferrer" onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()} />,
                        ul: ({children}) => <ul className="list-disc pl-4 mb-2">{children}</ul>,
                        ol: ({children}) => <ol className="list-decimal pl-4 mb-2">{children}</ol>,
                        li: ({children}) => <li className="mb-1">{children}</li>,
                        blockquote: ({children}) => <blockquote className="border-l-4 border-base-300 pl-2 italic my-2">{children}</blockquote>,
                        code: ({children}) => <code className="bg-base-300 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                        pre: ({children}) => <pre className="bg-base-300 rounded p-2 overflow-x-auto my-2 text-xs font-mono">{children}</pre>,
                      }}
                    >
                      {editDescription || '*No description*'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <textarea
                    ref={descriptionRef}
                    value={editDescription}
                    onChange={(e) => {
                      setEditDescription(e.target.value);
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onKeyDown={handleDescriptionKeyDown}
                    onBlur={handleDescriptionBlur}
                    placeholder="Add a description..."
                    className="w-full bg-base-200/50 rounded p-2 text-sm text-base-content/80 border-none outline-none resize-none overflow-hidden"
                  />
                )}
              </div>
            ) : (
              <div 
                onMouseDown={(e) => {
                  const el = e.target instanceof Element ? e.target : null;
                  if (el?.closest('a')) return;
                  if (el?.closest('.bot-comment')) return;
                  if (el?.closest('.bot-qa')) return;
                  e.preventDefault();
                  setModes({});
                  setIsEditingDescription(true);
                }}
                className="text-sm text-base-content/70 cursor-text border-l-2 border-base-300 pl-3 py-1 prose prose-sm max-w-none"
                    >
                {(() => {
                  return (
                    <>
                      {/* Render bot comments with special styling */}
                      {enhancedDescription.comments.map((comment) => {
                        const key = getBotCommentKey(comment);
                        const question = isBotQuestion(comment);
                        const existingAnswer = question
                          ? findInlineAnswerForBotComment(task.description || '', comment)
                          : null;
                        const isActiveQuestion =
                          isBotAnswerEditorOpen && activeBotQuestionKey === key;

                        return (
                          <div key={key} className="mb-2">
                            <BotCommentView
                              comment={comment}
                              onClick={
                                question
                                    ? () => openBotAnswerModal(key, formatBotMarker(comment), comment, existingAnswer)
                                  : undefined
                              }
                              className={question ? 'bot-comment' : undefined}
                              variant={question ? 'compact' : 'default'}
                              actions={
                                question && onUpdateDescription ? (
                                  <button
                                    className="btn btn-xs btn-square btn-ghost"
                                    title="Remove question"
                                    aria-label="Remove question"
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      const originalDesc = task.description || '';
                                      const nextDesc = removeBotCommentFromDescription(originalDesc, comment);
                                      await Promise.resolve(onUpdateDescription(task.id, nextDesc));
                                      if (activeBotQuestionKey === key) closeBotAnswerModal();
                                    }}
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                ) : null
                              }
                            />

                            {question && (onUpdateDescription || onAnswerBotQuestion) && (
                              <div
                                className="ml-7 mt-1 bot-qa"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-2">
                                  {existingAnswer ? (
                                    <span className="text-xs text-base-content/60 truncate max-w-[28rem]">
                                      <span className="badge badge-outline badge-success mr-2">Answered</span>
                                      <span className="opacity-80">{existingAnswer}</span>
                                    </span>
                                  ) : (
                                    <span className="text-xs text-base-content/50">Needs an answer</span>
                                  )}
                                </div>

                                {isActiveQuestion && (
                                  <div className="mt-1 bg-base-200/50 rounded p-2">
                                    <textarea
                                      autoFocus
                                      value={botAnswerDraft}
                                      onChange={(e) => {
                                        setBotAnswerDraft(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                      }}
                                      onFocus={(e) => {
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                      }}
                                      rows={1}
                                      placeholder="Type your answer…"
                                      className="textarea textarea-bordered w-full text-sm min-h-[2.25rem]"
                                      disabled={isSavingBotAnswer}
                                      onKeyDown={async (e) => {
                                        if (e.key === 'Escape') {
                                          e.preventDefault();
                                          closeBotAnswerModal();
                                          return;
                                        }
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                          e.preventDefault();
                                          await saveBotAnswer(false);
                                        }
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      
                      {/* Render clean description without bot HTML comments */}
                      {enhancedDescription.cleanDescription && (
                        <ReactMarkdown 
                          remarkPlugins={[remarkGfm, remarkBreaks]}
                          components={{
                            p: ({children}) => <span className="block mb-1 last:mb-0">{children}</span>,
                            a: ({node, ...props}) => (
                              <a 
                                {...props} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className="text-primary hover:underline cursor-pointer"
                                onMouseDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()} 
                              />
                            )
                          }}
                        >
                          {enhancedDescription.cleanDescription}
                        </ReactMarkdown>
                      )}
                    </>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* Render Plugin UI */}
      {pluginRegistry.getPlugins().map(plugin => {
        if (plugin.enabled && plugin.instance.onTaskRender) {
          return (
            <div key={plugin.name}>
              {plugin.instance.onTaskRender(task, {
                isEditing,
                isZenMode: preventAutoClose,
                onExit: () => { void requestExit(); }
              })}
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
