import { create } from 'zustand';
import { temporal } from 'zundo';
import type { StorageProvider } from '../adapters/StorageProvider';
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
import { MockCloudAdapter } from '../adapters/MockCloudAdapter';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter';
import { parseTasks, toggleTaskInMarkdown, addTaskToMarkdown, updateTaskTextInMarkdown, insertTaskAfterInMarkdown, reorderTaskInMarkdown, type Task } from '../lib/MarkdownParser';

interface TodoState {
  markdown: string;
  tasks: Task[];
  storage: StorageProvider;
  isLoading: boolean;
  fileList: string[];
  currentFile: string;
  isFolderMode: boolean;
  
  // Actions
  setStorage: (adapterName: 'local' | 'cloud' | 'fs') => void;
  loadTodos: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  updateTaskText: (taskId: string, newText: string) => Promise<void>;
  insertTaskAfter: (taskId: string, text: string) => Promise<void>;
  reorderTasks: (activeId: string, overId: string) => Promise<void>;
  updateMarkdown: (newMarkdown: string) => Promise<void>;
  openFileOrFolder: (type: 'file' | 'folder') => Promise<void>;
  selectFile: (filename: string) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<void>;
}

const adapters = {
  local: new LocalStorageAdapter(),
  cloud: new MockCloudAdapter(),
  fs: new FileSystemAdapter(),
};

export const useTodoStore = create<TodoState>()(
  temporal(
    (set, get) => ({
  markdown: '',
  tasks: [],
  storage: adapters.local,
  isLoading: false,
  fileList: [],
  currentFile: 'todo.md',
  isFolderMode: false,

  setStorage: (adapterName) => {
    set({ storage: adapters[adapterName] });
    // Don't auto-load for FS, wait for user action
    if (adapterName !== 'fs') {
      get().loadTodos();
    }
  },

  openFileOrFolder: async (type) => {
    const fsAdapter = adapters.fs;
    let success = false;
    
    if (type === 'folder') {
      success = await fsAdapter.openDirectory();
    } else {
      success = await fsAdapter.openFile();
    }

    if (success) {
      set({ storage: fsAdapter, isFolderMode: type === 'folder' });
      if (type === 'folder') {
        const files = await fsAdapter.list('');
        set({ fileList: files });
        if (files.length > 0) {
          get().selectFile(files[0]);
        } else {
          set({ markdown: '', tasks: [] });
        }
      } else {
        get().loadTodos();
      }
    }
  },

  selectFile: async (filename) => {
    set({ currentFile: filename, isLoading: true });
    const { storage } = get();
    const content = await storage.read(filename);
    const markdown = content || '';
    const tasks = parseTasks(markdown);
    set({ markdown, tasks, isLoading: false });
  },

  loadTodos: async () => {
    set({ isLoading: true });
    const { storage, currentFile } = get();
    const content = await storage.read(currentFile);
    const markdown = content || '# My Todo List\n\n- [ ] First task';
    const tasks = parseTasks(markdown);
    set({ markdown, tasks, isLoading: false });
  },

  toggleTask: async (taskId) => {
    const { markdown, storage, currentFile } = get();
    const newMarkdown = toggleTaskInMarkdown(markdown, taskId);
    const tasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks });
    await storage.write(currentFile, newMarkdown);
  },

  addTask: async (text) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = addTaskToMarkdown(markdown, text);
    
    set({ markdown: newMarkdown, tasks: parseTasks(newMarkdown) });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }
  },

  updateTaskText: async (taskId, newText) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = updateTaskTextInMarkdown(markdown, taskId, newText);
    
    set({ markdown: newMarkdown, tasks: parseTasks(newMarkdown) });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }
  },

  insertTaskAfter: async (taskId, text) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = insertTaskAfterInMarkdown(markdown, taskId, text);
    
    set({ markdown: newMarkdown, tasks: parseTasks(newMarkdown) });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }
  },

  reorderTasks: async (activeId, overId) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = reorderTaskInMarkdown(markdown, activeId, overId);
    
    set({ markdown: newMarkdown, tasks: parseTasks(newMarkdown) });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }
  },

  updateMarkdown: async (newMarkdown) => {
    const { storage, currentFile, isFolderMode } = get();
    set({ markdown: newMarkdown, tasks: parseTasks(newMarkdown) });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }
  },

  renameFile: async (oldName, newName) => {
    const { storage, fileList, currentFile } = get();
    if ('rename' in storage) {
      // @ts-expect-error - we know it exists on FileSystemAdapter
      await storage.rename(oldName, newName);
      
      const newFileList = fileList.map(f => f === oldName ? newName : f);
      set({ fileList: newFileList });
      
      if (currentFile === oldName) {
        set({ currentFile: newName });
      }
    }
  }
}), {
  partialize: (state) => ({ markdown: state.markdown }), // Only track markdown history
  limit: 100
}));
