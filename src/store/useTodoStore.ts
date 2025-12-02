import { create } from 'zustand';
import { temporal } from 'zundo';
import type { StorageProvider } from '../adapters/StorageProvider';
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
import { MockCloudAdapter } from '../adapters/MockCloudAdapter';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter';
import { GoogleDriveAdapter, type GoogleDriveConfig } from '../adapters/GoogleDriveAdapter';
import { parseTasks, toggleTaskInMarkdown, addTaskToMarkdown, updateTaskTextInMarkdown, insertTaskAfterInMarkdown, reorderTaskInMarkdown, deleteTaskInMarkdown, updateTaskDescriptionInMarkdown, nestTaskInMarkdown, type Task } from '../lib/MarkdownParser';
// import { pluginRegistry } from '../plugins/pluginEngine';

interface TodoState {
  markdown: string;
  tasks: Task[];
  storage: StorageProvider;
  isLoading: boolean;
  fileList: string[];
  currentFile: string;
  isFolderMode: boolean;
  compactMode: boolean;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  activeTag: string | null;
  
  // Actions
  setActiveTag: (tag: string | null) => void;
  setFontSize: (size: 'small' | 'normal' | 'large' | 'xl') => void;
  setCompactMode: (compact: boolean) => void;
  setStorage: (adapterName: 'local' | 'cloud' | 'fs' | 'google') => void;
  setGoogleDriveConfig: (config: GoogleDriveConfig) => Promise<void>;
  pickGoogleDriveFolder: () => Promise<void>;
  loadTodos: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  updateTaskText: (taskId: string, newText: string) => Promise<string | undefined>;
  updateTaskDescription: (taskId: string, description: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  insertTaskAfter: (taskId: string, text: string) => Promise<void>;
  reorderTasks: (activeId: string, overId: string) => Promise<void>;
  nestTask: (activeId: string, overId: string) => Promise<void>;
  updateMarkdown: (newMarkdown: string) => Promise<void>;
  openFileOrFolder: (type: 'file' | 'folder') => Promise<boolean>;
  selectFile: (filename: string) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<void>;
  createFile: (filename: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  grantPermission: () => Promise<void>;
  requiresPermission: boolean;
  restorableName: string;
}

const adapters = {
  local: new LocalStorageAdapter(),
  cloud: new MockCloudAdapter(),
  fs: new FileSystemAdapter(),
  google: new GoogleDriveAdapter(),
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
  compactMode: true,
  fontSize: 'normal',
  requiresPermission: false,
  restorableName: '',
  activeTag: null,

  setActiveTag: (tag) => set({ activeTag: tag }),

  setFontSize: (size) => set({ fontSize: size }),

  setCompactMode: (compact) => set({ compactMode: compact }),

  setStorage: (adapterName) => {
    set({ storage: adapters[adapterName] });
    localStorage.setItem('active-storage', adapterName);
    
    // Don't auto-load for FS, wait for user action
    if (adapterName === 'google') {
      const config = adapters.google.getConfig();
      if (config) {
        adapters.google.init().then(() => {
          set({ isFolderMode: true });
          adapters.google.list('').then(files => {
            set({ fileList: files });
            const lastFile = localStorage.getItem('lastOpenedFile');
            if (lastFile && files.includes(lastFile)) {
              get().selectFile(lastFile);
            } else if (files.length > 0) {
              get().selectFile(files[0]);
            }
          });
        }).catch(console.error);
      }
    } else if (adapterName !== 'fs') {
      get().loadTodos();
    }
  },

  setGoogleDriveConfig: async (config) => {
    adapters.google.setConfig(config);
  },

  pickGoogleDriveFolder: async () => {
    try {
      console.log('Store: Picking folder...');
      const folderId = await adapters.google.pickFolder();
      console.log('Store: Folder picked result:', folderId);
      
      if (folderId) {
        const config = adapters.google.getConfig();
        if (config) {
          const newConfig = { ...config, rootFolderId: folderId };
          adapters.google.setConfig(newConfig);
          console.log('Store: Config updated, listing files...');
          
          // Refresh file list
          try {
            const files = await adapters.google.list('');
            console.log('Store: Files listed:', files.length);
            set({ fileList: files });
            if (files.length > 0) {
              get().selectFile(files[0]);
            }
          } catch (listErr) {
            console.error('Store: Failed to list files after picking folder', listErr);
            alert('Folder selected, but failed to list files. Check console for API Key errors.');
          }
        }
      }
    } catch (error: any) {
      console.error('Error picking folder:', error);
      if (error.message && (error.message.includes('Client ID is missing') || error.message.includes('API Key is missing'))) {
        alert(error.message);
      } else {
        alert('Failed to connect to Google Drive. Please check the console for details.');
      }
    }
  },

  loadTodos: async () => {
    set({ isLoading: true, activeTag: null });
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
    const { markdown, storage, currentFile, isFolderMode, tasks: oldTasks } = get();
    const index = oldTasks.findIndex(t => t.id === taskId);

    const newMarkdown = updateTaskTextInMarkdown(markdown, taskId, newText);
    const newTasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks: newTasks });
    
    if (isFolderMode) {
      await storage.write(currentFile, newMarkdown);
    } else {
      await storage.write('todo.md', newMarkdown);
    }

    if (index !== -1 && newTasks[index]) {
      return newTasks[index].id;
    }
    return undefined;
  },

  deleteTask: async (taskId) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = deleteTaskInMarkdown(markdown, taskId);
    
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

  nestTask: async (activeId, overId) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = nestTaskInMarkdown(markdown, activeId, overId);
    
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

  updateTaskDescription: async (taskId, description) => {
    const { markdown, storage, currentFile, isFolderMode } = get();
    const newMarkdown = updateTaskDescriptionInMarkdown(markdown, taskId, description);
    
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
  },

  createFile: async (filename) => {
    const { storage, isFolderMode } = get();
    if (!isFolderMode) return;
    
    // Ensure extension
    if (!filename.endsWith('.md')) {
      filename += '.md';
    }
    
    await storage.write(filename, '# New List\n\n- [ ] New task');
    const files = await storage.list('');
    set({ fileList: files });
    get().selectFile(filename);
  },
  restoreSession: async () => {
    // Try to restore Google Drive session first
    const activeStorage = localStorage.getItem('active-storage');
    if (activeStorage === 'google') {
      const config = adapters.google.getConfig();
      if (config) {
        set({ storage: adapters.google, isFolderMode: true });
        try {
          await adapters.google.init();
          const files = await adapters.google.list('');
          set({ fileList: files });
          
          const lastFile = localStorage.getItem('lastOpenedFile');
          if (lastFile && files.includes(lastFile)) {
            get().selectFile(lastFile);
          } else if (files.length > 0) {
            get().selectFile(files[0]);
          }
          return; // Successfully restored Google session
        } catch (e) {
          console.error('Failed to restore Google Drive session', e);
          // Fall through to FS restore if Google fails
        }
      }
    }

    const fsAdapter = adapters.fs;
    const mode = await fsAdapter.restore();
    
    if (mode) {
      const status = await fsAdapter.checkPermissionStatus();
      
      if (status === 'granted') {
        set({ storage: fsAdapter, isFolderMode: mode === 'folder' });
        if (mode === 'folder') {
          try {
            const files = await fsAdapter.list('');
            set({ fileList: files });
            
            const lastFile = localStorage.getItem('lastOpenedFile');
            if (lastFile && files.includes(lastFile)) {
              get().selectFile(lastFile);
            } else if (files.length > 0) {
              get().selectFile(files[0]);
            } else {
              set({ markdown: '', tasks: [] });
            }
          } catch (e) {
            console.error('Failed to restore folder session', e);
          }
        } else {
          get().loadTodos();
        }
      } else {
        // Need permission
        set({ 
          requiresPermission: true, 
          restorableName: fsAdapter.getHandleName(),
          storage: fsAdapter, // Set storage so we can use it later
          isFolderMode: mode === 'folder'
        });
      }
    } else {
      get().loadTodos();
    }
  },

  grantPermission: async () => {
    const { storage, isFolderMode } = get();
    if (storage instanceof FileSystemAdapter) {
      const granted = await storage.requestPermissionAccess();
      if (granted) {
        set({ requiresPermission: false });
        if (isFolderMode) {
          const files = await storage.list('');
          set({ fileList: files });
          
          const lastFile = localStorage.getItem('lastOpenedFile');
          if (lastFile && files.includes(lastFile)) {
            get().selectFile(lastFile);
          } else if (files.length > 0) {
            get().selectFile(files[0]);
          } else {
            set({ markdown: '', tasks: [] });
          }
        } else {
          get().loadTodos();
        }
      }
    }
  },

  openFileOrFolder: async (type) => {
    const adapter = adapters.fs;
    if (type === 'folder') {
      const success = await adapter.openDirectory();
      if (success) {
        set({ storage: adapter, isFolderMode: true });
        const files = await adapter.list('');
        set({ fileList: files });
        if (files.length > 0) {
          get().selectFile(files[0]);
        }
      }
      return success;
    } else {
      const success = await adapter.openFile();
      if (success) {
        set({ storage: adapter, isFolderMode: false });
        const files = await adapter.list('');
        if (files.length > 0) {
          set({ currentFile: files[0] });
          get().loadTodos();
        }
      }
      return success;
    }
  },

  selectFile: async (filename) => {
    set({ currentFile: filename });
    localStorage.setItem('lastOpenedFile', filename);
    await get().loadTodos();
  },
    }),
    {
      partialize: (state) => ({ 
        markdown: state.markdown,
        tasks: state.tasks,
        compactMode: state.compactMode
      }),
      limit: 100
    }
  )
);
