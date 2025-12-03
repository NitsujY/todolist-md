import { create } from 'zustand';
import { temporal } from 'zundo';
import type { StorageProvider } from '../adapters/StorageProvider';
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
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
  setStorage: (adapterName: 'local' | 'fs' | 'google') => void;
  setGoogleDriveConfig: (config: GoogleDriveConfig) => Promise<void>;
  pickGoogleDriveFolder: () => Promise<void>;
  pickGoogleDriveFile: () => Promise<void>;
  switchGoogleAccount: () => Promise<void>;
  loadTodos: () => Promise<void>;
  toggleTask: (taskId: string) => Promise<void>;
  addTask: (text: string) => Promise<void>;
  updateTaskText: (taskId: string, newText: string) => Promise<string | undefined>;
  updateTaskDescription: (taskId: string, description: string) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  insertTaskAfter: (taskId: string, text: string) => Promise<void>;
  reorderTasks: (activeId: string, overId: string) => Promise<void>;
  reorderFiles: (activeFile: string, overFile: string) => void;
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
  fs: new FileSystemAdapter(),
  google: new GoogleDriveAdapter(),
};

const sortFiles = (files: string[]) => {
  try {
    const savedOrder = JSON.parse(localStorage.getItem('file-order') || '[]');
    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      return [...files].sort((a, b) => {
        const indexA = savedOrder.indexOf(a);
        const indexB = savedOrder.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
      });
    }
  } catch (e) {
    console.error('Failed to sort files', e);
  }
  return files;
};

import { arrayMove } from '@dnd-kit/sortable';

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
      set({ isLoading: true });
      const config = adapters.google.getConfig();
      if (config) {
        adapters.google.init().then(() => {
          set({ isFolderMode: true });
          adapters.google.list('').then(files => {
            set({ fileList: sortFiles(files), isLoading: false });
            const lastFile = localStorage.getItem('lastOpenedFile');
            if (lastFile && files.includes(lastFile)) {
              get().selectFile(lastFile);
            } else if (files.length > 0) {
              get().selectFile(files[0]);
            }
          }).catch(e => {
            console.error(e);
            set({ isLoading: false });
          });
        }).catch(e => {
          console.error(e);
          set({ isLoading: false });
        });
      } else {
        set({ isLoading: false });
      }
    } else if (adapterName !== 'fs') {
      get().loadTodos();
    }
  },

  setGoogleDriveConfig: async (config) => {
    adapters.google.setConfig(config);
  },

  switchGoogleAccount: async () => {
    try {
      await adapters.google.switchAccount();
      // After switching, refresh the list
      const files = await adapters.google.list('');
      set({ fileList: sortFiles(files) });
      if (files.length > 0) {
        get().selectFile(files[0]);
      } else {
        set({ markdown: '', tasks: [] });
      }
    } catch (error) {
      console.error('Failed to switch account', error);
    }
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
            set({ fileList: sortFiles(files) });
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

  pickGoogleDriveFile: async () => {
    try {
      const file = await adapters.google.pickFile();
      if (file) {
        // We need to ensure this file is in the list or just open it directly
        // Since we are in folder mode usually, we might want to just add it to the list if not present
        // But wait, if we are in folder mode, we list files in the rootFolderId.
        // If this file is elsewhere, it won't show up in the list unless we change rootFolderId or handle single file mode.
        // For simplicity, let's just open it and add to list temporarily if needed.
        
        // Actually, picking a file grants access to it.
        // If we just select it, the read() method will find it by name if we use name as ID in our store?
        // Our store uses filename as ID for FS/Google.
        // GoogleDriveAdapter uses a cache mapping filename -> ID.
        // So we should update the cache.
        
        // The adapter's pickFile returns { id, name }.
        // We can't easily inject it into the adapter's cache from here without a method, 
        // but the adapter handles it internally if we call read? No.
        
        // Let's just refresh the list. If the file is in the current folder, it will appear.
        // If it's NOT in the current folder, we have a problem because our UI assumes a single folder view.
        
        // However, the user's issue is likely that they picked a folder, but the file inside it is read-only.
        // Picking the file explicitly grants write access.
        // So if they pick the SAME file that is already in the list, it should just work.
        
        // So we just need to select it.
        get().selectFile(file.name);
      }
    } catch (error) {
      console.error('Error picking file:', error);
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

  reorderFiles: (activeFile, overFile) => {
    const { fileList } = get();
    const oldIndex = fileList.indexOf(activeFile);
    const newIndex = fileList.indexOf(overFile);
    
    if (oldIndex !== -1 && newIndex !== -1) {
      const newFileList = arrayMove(fileList, oldIndex, newIndex);
      set({ fileList: newFileList });
      // Persist order
      localStorage.setItem('file-order', JSON.stringify(newFileList));
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
      // Update persisted order
      localStorage.setItem('file-order', JSON.stringify(newFileList));
      
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
    
    await storage.write(filename, '- [ ] New task');
    const files = await storage.list('');

    // Update persisted order to include new file
    try {
      const savedOrder = JSON.parse(localStorage.getItem('file-order') || '[]');
      if (Array.isArray(savedOrder) && !savedOrder.includes(filename)) {
        savedOrder.push(filename);
        localStorage.setItem('file-order', JSON.stringify(savedOrder));
      }
    } catch (e) {
      console.error('Failed to update file order', e);
    }

    set({ fileList: sortFiles(files) });
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
          set({ fileList: sortFiles(files) });
          
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
            set({ fileList: sortFiles(files) });
            
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
          set({ fileList: sortFiles(files) });
          
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
        set({ fileList: sortFiles(files) });
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
