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
  const visit = (node: any) => {
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
        type: 'header'
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
          type: 'empty'
        });
      }
    }

    if (isTask) {
      // Generate a stable-ish ID based on content and position (for demo purposes)
      const id = `${node.position?.start.line}-${text.substring(0, 10)}`;
      
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
        description: description || undefined
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
