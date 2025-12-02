import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import type { ListItem, Root } from 'mdast';

export interface Task {
  id: string;
  text: string;
  completed: boolean;
  type?: 'task' | 'header' | 'empty';
  description?: string;
  tags?: string[];
  depth: number;
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any, depth: number = 0) => {
    let isTask = false;
    let checked = false;
    let text = '';

    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text = node.children.map((c: any) => c.value || '').join('');
      const id = `${node.position?.start.line}-header-${text.substring(0, 10)}`;
      tasks.push({
        id,
        text,
        completed: false,
        type: 'header',
        depth: 0
      });
      return;
    }

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
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

      if (!isTask && !text) {
        const id = `${node.position?.start.line}-empty`;
        tasks.push({
          id,
          text: '',
          completed: false,
          type: 'empty',
          tags: [],
          depth
        });
      }
    }

    if (isTask) {
      // Generate a stable-ish ID based on content and position (for demo purposes)
      const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
      
      // Extract tags: matches #tag but not \#tag
      const tags: string[] = [];
      const tagRegex = /(?<!\\)#([a-zA-Z0-9_]+)/g;
      let match;
      while ((match = tagRegex.exec(text)) !== null) {
        tags.push(match[1]);
      }

      // Check for description (blockquote)
      let description = '';
      if (node.children && node.children.length > 1) {
        // Look for blockquote in children
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blockquote = node.children.find((c: any) => c.type === 'blockquote');
        if (blockquote && blockquote.children) {
          // Extract text from blockquote
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          description = blockquote.children.map((p: any) => {
            if (p.type === 'paragraph' && p.children) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              return p.children.map((c: any) => c.value || '').join('');
            }
            return '';
          }).join('\n');
        }
      }

      tasks.push({
        id,
        text,
        completed: checked,
        type: 'task',
        description: description || undefined,
        tags,
        depth
      });
    }
    
    if (node.children) {
      node.children.forEach((child: any) => {
        if (child.type === 'list') {
          // If we are inside a listItem, and we see a list, it's a nested list.
          // But wait, my recursion logic:
          // visit(tree, 0) -> tree has children (List)
          // visit(List, 0) -> List has children (ListItem)
          // visit(ListItem, 0) -> ListItem has children (Paragraph, List?)
          // If ListItem has List child, we want to visit that List with depth + 1
          
          // Actually, I should handle the recursion logic here carefully.
          // If I am visiting a ListItem, I am AT 'depth'.
          // Any List child of this ListItem represents 'depth + 1' items.
          
          // But 'visit' is generic.
          // If node is 'list', I should pass 'depth' to its children?
          // No, if node is 'list', its children are 'listItem's at the SAME depth as the list implies?
          
          // Let's trace:
          // Root -> List (A)
          // List (A) -> ListItem (1)
          // ListItem (1) -> List (B)
          // List (B) -> ListItem (2)
          
          // visit(Root, 0)
          //   visit(List A, 0)
          //     visit(ListItem 1, 0) -> Pushes Task (depth 0)
          //       visit(List B, ?)
          
          // I need to increment depth when entering a List that is NOT the root list?
          // Or just increment depth when entering a List?
          // If I increment at List A, then ListItem 1 is depth 1.
          // But I want top level to be depth 0.
          
          // So:
          // visit(Root, 0)
          //   visit(List A, 0) -> It's a list.
          //     visit(ListItem 1, 0)
          //       visit(List B, 1) -> It's a nested list.
          //         visit(ListItem 2, 1)
          
          // So, if I am in a ListItem, and I see a List child, I call visit(List, depth + 1).
          // If I am in a List, I call visit(ListItem, depth).
          // If I am in Root, I call visit(List, 0).
          
          // My generic recursion `node.children.forEach` needs to be smarter or I handle it in specific blocks.
          
          visit(child, depth + 1); 
        } else {
          // For non-list children (like paragraph inside listItem), depth doesn't change
          // But wait, if I am in List A, child is ListItem 1.
          // If I call visit(ListItem 1, depth + 1), it becomes 1.
          // I want 0.
          
          // Let's refine:
          // Only increment depth when passing from ListItem -> List.
          
          // But 'visit' is called on everything.
          // I need to know if 'node' is a List.
          
          // Let's change the signature or logic.
          visit(child, depth);
        }
      });
    }
  };
  
  // We need a specialized visitor to handle the depth increment correctly
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recursiveVisit = (node: any, currentDepth: number) => {
    // Process the node (extract task)
    let isTask = false;
    let checked = false;
    let text = '';

    if (node.type === 'heading') {
      // ... (same extraction logic)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      text = node.children.map((c: any) => c.value || '').join('');
      const id = `${node.position?.start.line}-header-${text.substring(0, 10)}`;
      tasks.push({
        id,
        text,
        completed: false,
        type: 'header',
        depth: 0 // Headers are always top level for now
      });
      // Headers don't usually contain lists directly in GFM, but they might be followed by them.
      // We don't recurse into headers for tasks usually.
      return;
    }

    if (node.type === 'listItem') {
       // ... (same extraction logic)
       if (typeof node.checked === 'boolean') {
        isTask = true;
        checked = node.checked;
      }
      
      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          checked = match[1].toLowerCase() === 'x';
          text = match[2];
        }
      }

      if (!isTask && !text) {
        const id = `${node.position?.start.line}-empty`;
        tasks.push({
          id,
          text: '',
          completed: false,
          type: 'empty',
          tags: [],
          depth: currentDepth
        });
      }

      if (isTask) {
        const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
        const tags: string[] = [];
        const tagRegex = /(?<!\\)#([a-zA-Z0-9_]+)/g;
        let match;
        while ((match = tagRegex.exec(text)) !== null) {
          tags.push(match[1]);
        }

        let description = '';
        if (node.children && node.children.length > 1) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blockquote = node.children.find((c: any) => c.type === 'blockquote');
          if (blockquote && blockquote.children) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            description = blockquote.children.map((p: any) => {
              if (p.type === 'paragraph' && p.children) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                return p.children.map((c: any) => c.value || '').join('');
              }
              return '';
            }).join('\n');
          }
        }

        tasks.push({
          id,
          text,
          completed: checked,
          type: 'task',
          description: description || undefined,
          tags,
          depth: currentDepth
        });
      }
    }

    // Recurse
    if (node.children) {
      node.children.forEach((child: any) => {
        if (child.type === 'list') {
          // If we are inside a listItem, and we see a list, it is a nested list.
          // The items inside this list should be at currentDepth + 1.
          // BUT, if we are at Root, and we see a list, it is depth 0.
          
          // How to distinguish?
          // We can check parent type? But we don't have parent here easily.
          // We can rely on the fact that 'listItem' calls this.
          
          // If I am processing a listItem, I am at 'currentDepth'.
          // If I find a child that is a 'list', I should visit it.
          // And that list's children (listItems) should be at 'currentDepth + 1'.
          
          // So:
          // If node is listItem:
          //   recurse(child, currentDepth + 1) if child is list?
          //   recurse(child, currentDepth) if child is paragraph?
          
          // If node is list:
          //   recurse(child, currentDepth) (child is listItem)
          
          // If node is root:
          //   recurse(child, 0)
          
          // Let's try to implement this logic inside the loop.
          
          if (node.type === 'listItem') {
             recursiveVisit(child, currentDepth + 1);
          } else {
             recursiveVisit(child, currentDepth);
          }
        } else {
          recursiveVisit(child, currentDepth);
        }
      });
    }
  };
  
  // Wait, the logic above is slightly flawed.
  // Root -> List. recursiveVisit(List, 0).
  // List -> ListItem. recursiveVisit(ListItem, 0).
  // ListItem -> List. recursiveVisit(List, 1). (Because node.type is listItem).
  // List -> ListItem. recursiveVisit(ListItem, 1).
  
  // This looks correct!
  
  recursiveVisit(tree, 0);
  return tasks;
};

export const toggleTaskInMarkdown = (markdown: string, taskId: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
          const wasChecked = node.checked;
          node.checked = !wasChecked;
          
          // Handle @done(YYYY-MM-DD) tag
          if (node.children && node.children.length > 0) {
            const p = node.children[0];
            if (p.type === 'paragraph' && p.children) {
              // We need to modify the text content to add/remove @done tag
              // This is a bit complex with remark AST, so we might need to reconstruct the text
              // But remark-stringify handles node.checked for us.
              // We just need to append/remove the tag from the text node.
              
              // Find the text node
              const textNode = p.children.find((c: any) => c.type === 'text');
              if (textNode) {
                let content = textNode.value;
                const doneRegex = / @done\(\d{4}-\d{2}-\d{2}\)/;
                
                if (node.checked) {
                  // Task became completed, add tag if not present
                  if (!doneRegex.test(content)) {
                    const today = new Date().toISOString().split('T')[0];
                    textNode.value = `${content} @done(${today})`;
                  }
                } else {
                  // Task became incomplete, remove tag
                  textNode.value = content.replace(doneRegex, '');
                }
              }
            }
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

export const updateTaskTextInMarkdown = (markdown: string, taskId: string, newText: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any) => {
    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = node.children.map((c: any) => c.value || '').join('');
      const id = `${node.position?.start.line}-header-${text.substring(0, 10)}`;
      
      if (id === taskId) {
        node.children = [{ type: 'text', value: newText }];
      }
    }

    if (node.type === 'listItem') {
      let isTask = false;
      let text = '';
      
      if (typeof node.checked === 'boolean') {
        isTask = true;
      }

      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          text = match[2];
        }
      }

      if (!isTask && !text) {
        const id = `${node.position?.start.line}-empty`;
        if (id === taskId) {
          // Update empty task to be a real task
          node.checked = false; // Make it a task
          if (!node.children || node.children.length === 0) {
            node.children = [{
              type: 'paragraph',
              children: [{ type: 'text', value: newText }]
            }];
          } else {
             // It might have children but no text (e.g. empty paragraph)
             const p = node.children[0];
             if (p.type === 'paragraph') {
               p.children = [{ type: 'text', value: newText }];
             }
          }
        }
      }

      if (isTask) {
        const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
        if (id === taskId) {
          // Update text
          if (node.children && node.children.length > 0) {
            const p = node.children[0];
            if (p.type === 'paragraph') {
              // Replace children with new text node
              p.children = [{ type: 'text', value: newText }];
            }
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

export const deleteTaskInMarkdown = (markdown: string, taskId: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any, index: number, parent: any) => {
    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = node.children.map((c: any) => c.value || '').join('');
      const id = `${node.position?.start.line}-header-${text.substring(0, 10)}`;
      
      if (id === taskId) {
        // Delete header
        // Also delete subsequent list if it exists? 
        // Usually deleting a section header might imply deleting content, but let's just delete the header for now
        // or maybe merge content to previous section?
        // For safety, let's just delete the header.
        parent.children.splice(index, 1);
        return true;
      }
    }

    if (node.type === 'listItem') {
      let isTask = false;
      let text = '';
      
      if (typeof node.checked === 'boolean') {
        isTask = true;
      }

      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          text = match[2];
        }
      }

      if (!isTask && !text) {
        const id = `${node.position?.start.line}-empty`;
        if (id === taskId) {
          parent.children.splice(index, 1);
          return true;
        }
      }

      if (isTask) {
        const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
        if (id === taskId) {
          parent.children.splice(index, 1);
          return true;
        }
      }
    }
    
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        if (visit(node.children[i], i, node)) return true;
      }
    }
    return false;
  };

  // We need to pass parent, so we iterate top level manually or wrap visit
  for (let i = 0; i < tree.children.length; i++) {
    if (visit(tree.children[i], i, tree)) break;
  }
  
  return processor.stringify(tree);
};

export const insertTaskAfterInMarkdown = (markdown: string, targetTaskId: string, newTaskText: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  const newTaskNode: ListItem = {
    type: 'listItem',
    checked: false,
    spread: false,
    children: [{
      type: 'paragraph',
      children: [{ type: 'text', value: newTaskText }]
    }]
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const visit = (node: any) => {
    // Handle inserting after a header
    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = node.children.map((c: any) => c.value || '').join('');
      const id = `${node.position?.start.line}-header-${text.substring(0, 10)}`;
      
      if (id === targetTaskId) {
        // We found the header. We need to insert a list after it, or append to the existing list.
        // But 'visit' is traversing. We need access to the parent to insert AFTER this node.
        // This traversal pattern doesn't give us parent easily unless we pass it.
        // Let's change strategy: find the node index in parent.
        return true; // Signal found, but we need to handle it in the parent loop
      }
    }

    if (node.type === 'list' && node.children) {
      // Iterate through children to find the target task
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        if (child.type === 'listItem') {
          let isTask = false;
          let text = '';
          
          if (typeof child.checked === 'boolean') {
            isTask = true;
          }

          if (child.children && child.children.length > 0) {
            const p = child.children[0];
            if (p.type === 'paragraph' && p.children && p.children.length > 0) {
               // eslint-disable-next-line @typescript-eslint/no-explicit-any
               text = p.children.map((c: any) => c.value || '').join('');
            }
          }

          if (!isTask && text) {
            const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
            if (match) {
              isTask = true;
              text = match[2];
            }
          }

          if (!isTask && !text) {
             const id = `${child.position?.start.line}-empty`;
             if (id === targetTaskId) {
               node.children.splice(i + 1, 0, newTaskNode);
               return true;
             }
          }

          if (isTask) {
            const id = `${child.position?.start.line}-${text.substring(0, 10)}`;
            if (id === targetTaskId) {
              // Found the target task, insert new task after it
              node.children.splice(i + 1, 0, newTaskNode);
              return true; // Stop visiting
            }
          }
        }
      }
    }
    
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        // Check if child is the target header
        if (child.type === 'heading') {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           const text = child.children.map((c: any) => c.value || '').join('');
           const id = `${child.position?.start.line}-header-${text.substring(0, 10)}`;
           if (id === targetTaskId) {
             // Found header. Check if next sibling is a list.
             const nextSibling = node.children[i + 1];
             if (nextSibling && nextSibling.type === 'list') {
               // Prepend to existing list
               nextSibling.children.unshift(newTaskNode);
             } else {
               // Create new list after header
               node.children.splice(i + 1, 0, {
                 type: 'list',
                 ordered: false,
                 spread: false,
                 children: [newTaskNode]
               });
             }
             return true;
           }
        }
        
        if (visit(child)) return true;
      }
    }
    return false;
  };

  visit(tree);
  return processor.stringify(tree);
};

export const reorderTaskInMarkdown = (markdown: string, activeId: string, overId: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeParent: any = null;
  let activeIndex = -1;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let overParent: any = null;
  let overIndex = -1;

  // Helper to identify nodes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identifyNode = (node: any): string | null => {
    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = node.children.map((c: any) => c.value || '').join('');
      return `${node.position?.start.line}-header-${text.substring(0, 10)}`;
    }
    
    if (node.type === 'listItem') {
      let isTask = false;
      let text = '';
      
      if (typeof node.checked === 'boolean') {
        isTask = true;
      }

      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          text = match[2];
        }
      }

      if (!isTask && !text) {
        return `${node.position?.start.line}-empty`;
      }

      if (isTask) {
        return `${node.position?.start.line}-${text.substring(0, 10)}`;
      }
    }
    return null;
  };

  // First pass: find nodes and their parents
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findNodes = (node: any) => {
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const id = identifyNode(child);
        
        if (id === activeId) {
          activeNode = child;
          activeParent = node;
          activeIndex = i;
        }
        if (id === overId) {
          overParent = node;
          overIndex = i;
        }
        
        // If overId wasn't found directly, check if it's a child of this node (e.g. task in a list)
        // But identifyNode only works for direct children of root usually (headers) or list items
        // If overId is a task, it is inside a list.
        // The list is a child of root.
        // So we need to check if any child of THIS node matches overId?
        // No, findNodes recurses.
        
        // If we are at root, and child is a list.
        // We want to know if overId is inside this list.
        if (child.type === 'list' && child.children) {
           // Check children of list
           for (const grandChild of child.children) {
             if (identifyNode(grandChild) === overId) {
               // Found overId inside a list.
               // If we are moving a header, we treat this list as the target.
               overParent = node; // root
               overIndex = i; // index of the list
             }
           }
        }
      }
      node.children.forEach(findNodes);
    }
  };

  findNodes(tree);

  // Fix for dragging Header onto a Task (which is inside a List)
  // We want to target the List containing the Task, which is a child of Root
  if (activeNode?.type === 'heading' && overParent?.type === 'list') {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listIndex = tree.children.findIndex((c: any) => c === overParent);
    if (listIndex !== -1) {
      overParent = tree;
      overIndex = listIndex;
    }
  }

  if (activeNode && activeParent && overParent && activeIndex !== -1 && overIndex !== -1) {
    // Check if we are moving a header
    if (activeNode.type === 'heading') {
      // If moving a header, we need to move it AND all subsequent nodes until the next header
      const nodesToMove = [activeNode];
      let nextIndex = activeIndex + 1;
      while (nextIndex < activeParent.children.length) {
        const nextNode = activeParent.children[nextIndex];
        if (nextNode.type === 'heading') break;
        nodesToMove.push(nextNode);
        nextIndex++;
      }

      // Calculate overGroup length (to know where to insert if swapping)
      // If overNode is a heading, overGroup is heading + subsequent.
      // If overNode is a list (because we dropped on a task), overGroup is just that list?
      // No, if we drop on a task in Section 2, we are dropping on Section 2's list.
      // Section 2 consists of Heading + List.
      // If overIndex points to the List.
      // The "Group" is the List?
      // Or should we find the Heading associated with this List?
      
      // Let's simplify: If we drop on a list, we insert AFTER that list?
      // If we drop on a Heading, we insert BEFORE that Heading?
      // dnd-kit behavior is subtle.
      
      // Let's assume we want to swap the "Active Section" with the "Over Section".
      // If overIndex points to a List, the "Over Section" is the Heading before it + the List.
      // But we might have skipped the Heading.
      
      // Let's just use the insertion index logic derived earlier.
      // If activeIndex < overIndex (moving down).
      // We want to insert AFTER the overNode (and its group if it's a header).
      
      let insertIndex = overIndex;
      
      // If moving down
      if (activeIndex < overIndex) {
        // We need to know how many items to skip to be "after" the over target.
        // If overNode is a Heading, we want to skip the Heading AND its children (List).
        // If overNode is a List, we want to skip the List.
        
        let itemsToSkip = 1; // The overNode itself
        
        const overNode = overParent.children[overIndex];
        if (overNode.type === 'heading') {
           let next = overIndex + 1;
           while (next < overParent.children.length) {
             if (overParent.children[next].type === 'heading') break;
             itemsToSkip++;
             next++;
           }
        }
        
        insertIndex = overIndex + itemsToSkip;
      }
      
      // Remove from old position
      activeParent.children.splice(activeIndex, nodesToMove.length);

      // Adjust insertIndex for removal
      if (activeParent === overParent) {
        if (activeIndex < insertIndex) {
          insertIndex -= nodesToMove.length;
        }
      }

      // Insert at new position
      overParent.children.splice(insertIndex, 0, ...nodesToMove);

    } else {
      // Normal task reordering
      
      // Special case: Dropping a task onto a Header
      const overNode = overParent.children[overIndex];
      if (overNode.type === 'heading') {
        // We want to move the task to the section defined by this header.
        // This usually means inserting it into the list immediately following the header.
        // Or creating a new list if one doesn't exist.
        
        // Remove from old position first
        activeParent.children.splice(activeIndex, 1);
        
        // Find if there is a list after the header
        const nextSibling = overParent.children[overIndex + 1];
        if (nextSibling && nextSibling.type === 'list') {
          // Prepend to existing list
          nextSibling.children.unshift(activeNode);
        } else {
          // Create new list after header
          overParent.children.splice(overIndex + 1, 0, {
            type: 'list',
            ordered: false,
            spread: false,
            children: [activeNode]
          });
        }
        
        return processor.stringify(tree);
      }

      // Remove from old position
      activeParent.children.splice(activeIndex, 1);
      
      // If parents are different, we need to adjust index if we removed from same list before insertion point
      if (activeParent === overParent) {
        if (activeIndex < overIndex) {
          overIndex--; // Adjust for removal
        }
      }
      
      // Insert at new position
      overParent.children.splice(overIndex, 0, activeNode);
    }
  }

  return processor.stringify(tree);
};

export const nestTaskInMarkdown = (markdown: string, activeId: string, overId: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeNode: any = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let activeParent: any = null;
  let activeIndex = -1;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let overNode: any = null;

  // Helper to identify nodes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const identifyNode = (node: any): string | null => {
    if (node.type === 'heading') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const text = node.children.map((c: any) => c.value || '').join('');
      return `${node.position?.start.line}-header-${text.substring(0, 10)}`;
    }
    
    if (node.type === 'listItem') {
      let isTask = false;
      let text = '';
      
      if (typeof node.checked === 'boolean') {
        isTask = true;
      }

      if (node.children && node.children.length > 0) {
        const p = node.children[0];
        if (p.type === 'paragraph' && p.children && p.children.length > 0) {
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          text = match[2];
        }
      }

      if (!isTask && !text) {
        return `${node.position?.start.line}-empty`;
      }

      if (isTask) {
        return `${node.position?.start.line}-${text.substring(0, 10)}`;
      }
    }
    return null;
  };

  // Find nodes
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const findNodes = (node: any) => {
    if (node.children) {
      for (let i = 0; i < node.children.length; i++) {
        const child = node.children[i];
        const id = identifyNode(child);
        
        if (id === activeId) {
          activeNode = child;
          activeParent = node;
          activeIndex = i;
        }
        if (id === overId) {
          overNode = child;
        }
        
        // Recurse
        findNodes(child);
      }
    }
  };

  findNodes(tree);

  if (activeNode && activeParent && overNode && overNode.type === 'listItem') {
    // Remove from old position
    activeParent.children.splice(activeIndex, 1);

    // Add to new position (overNode's children)
    // Check if overNode has a list child
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const listChild = overNode.children.find((c: any) => c.type === 'list');
    
    if (listChild) {
      listChild.children.push(activeNode);
    } else {
      // Create new list
      overNode.children.push({
        type: 'list',
        ordered: false,
        spread: false,
        children: [activeNode]
      });
    }
  }

  return processor.stringify(tree);
};

export const updateTaskDescriptionInMarkdown = (markdown: string, taskId: string, description: string): string => {
  const processor = createProcessor();
  const tree = processor.parse(markdown) as Root;
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
           // eslint-disable-next-line @typescript-eslint/no-explicit-any
           text = p.children.map((c: any) => c.value || '').join('');
        }
      }

      if (!isTask && text) {
        const match = text.match(/^\[([ xX]?)\]\s+(.*)/);
        if (match) {
          isTask = true;
          text = match[2];
        }
      }

      if (isTask) {
        const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
        if (id === taskId) {
          // Find existing blockquote
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const blockquoteIndex = node.children.findIndex((c: any) => c.type === 'blockquote');
          
          if (description) {
            const newBlockquote = {
              type: 'blockquote',
              children: description.split('\n').map(line => ({
                type: 'paragraph',
                children: [{ type: 'text', value: line }]
              }))
            };

            if (blockquoteIndex !== -1) {
              node.children[blockquoteIndex] = newBlockquote;
            } else {
              // Insert after paragraph
              node.children.splice(1, 0, newBlockquote);
            }
          } else {
            // Remove description
            if (blockquoteIndex !== -1) {
              node.children.splice(blockquoteIndex, 1);
            }
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
