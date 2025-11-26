import { create } from 'zustand';
import type { StorageProvider } from '../adapters/StorageProvider';
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
import { MockCloudAdapter } from '../adapters/MockCloudAdapter';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter';
import { parseTasks, toggleTaskInMarkdown, addTaskToMarkdown, type Task } from '../lib/MarkdownParser';

interface TodoState {
  markdown: string;
  tasks: Task[];
  storage: StorageProvider;
  isLoading: boolean;
  
  // Actions
  setStorage: (adapterName: 'local' | 'cloud' | 'fs') => void;
  loadTodos: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  updateMarkdown: (newMarkdown: string) => Promise<void>;
}

const adapters = {
  local: new LocalStorageAdapter(),
  cloud: new MockCloudAdapter(),
  fs: new FileSystemAdapter(),
};

export const useTodoStore = create<TodoState>((set, get) => ({
  markdown: '',
  tasks: [],
  storage: adapters.local,
  isLoading: false,

  setStorage: (adapterName) => {
    set({ storage: adapters[adapterName] });
    get().loadTodos();
  },

  loadTodos: async () => {
    set({ isLoading: true });
    const { storage } = get();
    const content = await storage.read('todo.md');
    const markdown = content || '# My Todo List\n\n- [ ] First task';
    const tasks = parseTasks(markdown);
    set({ markdown, tasks, isLoading: false });
  },

  toggleTask: async (taskId) => {
    const { markdown, storage } = get();
    const newMarkdown = toggleTaskInMarkdown(markdown, taskId);
    const tasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks });
    await storage.write('todo.md', newMarkdown);
  },

  addTask: async (text) => {
    const { markdown, storage } = get();
    const newMarkdown = addTaskToMarkdown(markdown, text);
    const tasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks });
    await storage.write('todo.md', newMarkdown);
  },

  updateMarkdown: async (newMarkdown) => {
    const { storage } = get();
    const tasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks });
    await storage.write('todo.md', newMarkdown);
  }
}));
