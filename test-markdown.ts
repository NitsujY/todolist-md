
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import remarkGfm from 'remark-gfm';
import type { ListItem, Root } from 'mdast';

const processor = unified()
  .use(remarkParse)
  .use(remarkGfm)
  .use(remarkStringify, {
    bullet: '-',
    listItemIndent: 'one',
  });

const existingMarkdown = '- abc\n';

const tree = processor.parse(existingMarkdown) as Root;

const newTaskNode: ListItem = {
  type: 'listItem',
  checked: false,
  spread: false,
  children: [{
    type: 'paragraph',
    children: [{ type: 'text', value: 'test task' }]
  }]
};

const lastNode = tree.children[tree.children.length - 1];
if (lastNode && lastNode.type === 'list') {
  lastNode.children.push(newTaskNode);
}

console.log(processor.stringify(tree));
