import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import type { ListItem, Root } from 'mdast';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
}

const createProcessor = () => unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    listItemIndent: 'one',
  });

export const parseTasks = (markdown: string): Task[] => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  const tasks: Task[] = [];

  // Simple traversal to find task list items
  // In a real app, use 'unist-util-visit'
  const visit = (node: any) => {
    let isTask = false;
    let checked = false;
    let text = '';

    // Check if it's a GFM task list item
    if (node.type === 'listItem') {
      if (typeof node.checked === 'boolean') {
        isTask = true;
        checked = node.checked;
      }
      
      // Extract text
      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      // Fallback: Check for manual [ ] or [x] in text if GFM failed or user typed it manually
      if (!isTask && text) {
        // Allow [ ], [x], [X], and also [] (empty) for flexibility
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          checked = match[1].toLowerCase() === 'x';
          text = match[2];
        }
      }
    }

    if (isTask) {
      // Generate a stable-ish ID based on content and position (for demo purposes)
      const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
      
      tasks.push({
        id,
        text,
        completed: checked
      });
    }
    
    if (node.children) {
      node.children.forEach(visit);
    }
  };

  visit(tree);
  return tasks;
};

export const toggleTaskInMarkdown = (markdown: string, taskId: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  const visit = (node: any) => {
    if (node.type === 'listItem') {
      let isTask = false;
      let text = '';
      
      if (typeof node.checked === 'boolean') {
        isTask = true;
      }

      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
        }
      }

      if (isTask) {
        const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
        if (id === taskId) {
          if (typeof node.checked === 'boolean') {
            node.checked = !node.checked;
          } else {
            // Handle manual text toggle
            // This is tricky because we need to modify the text node
            // For now, let's just assume GFM works for writing
            node.checked = !node.checked; // Try to force GFM property
          }
        }
      }
    }
    if (node.children) {
      node.children.forEach(visit);
    }
  };

  visit(tree);
  return processor.stringify(tree);
};

export const addTaskToMarkdown = (markdown: string, taskText: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  const newTaskNode: ListItem = {
    type: 'listItem',
    checked: false,
    spread: false,
    children: [{
      type: 'paragraph',
      children: [{ type: 'text', value: taskText }]
    }]
  };

  const lastNode = tree.children[tree.children.length - 1];
  if (lastNode && lastNode.type === 'list' && lastNode.ordered === false) {
    lastNode.children.push(newTaskNode);
  } else {
    tree.children.push({
      type: 'list',
      ordered: false,
      spread: false,
      children: [newTaskNode]
    });
  }

  return processor.stringify(tree);
};
