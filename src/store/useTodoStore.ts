import { create } from 'zustand';
import { temporal } from 'zundo';
import type { StorageProvider } from '../adapters/StorageProvider';
import { LocalStorageAdapter } from '../adapters/LocalStorageAdapter';
import { FileSystemAdapter } from '../adapters/FileSystemAdapter';
import { GoogleDriveAdapter, type GoogleDriveConfig } from '../adapters/GoogleDriveAdapter';
import { parseTasks, toggleTaskInMarkdown, addTaskToMarkdown, updateTaskTextInMarkdown, insertTaskAfterInMarkdown, reorderTaskInMarkdown, deleteTaskInMarkdown, updateTaskDescriptionInMarkdown, nestTaskInMarkdown, hasRemindersFileMarker, type Task } from '../lib/MarkdownParser';
import type { FileMeta } from '../adapters/StorageProvider';
import { ConfigService } from '../services/ConfigService';
import { pluginRegistry } from '../plugins/pluginEngine.tsx';

type FileCacheEntry = {
  markdown: string;
  tasks: Task[];
  meta?: FileMeta;
  fetchedAt: number;
};

interface TodoState {
  markdown: string;
  tasks: Task[];
  storage: StorageProvider;
  configService: ConfigService;
  isLoading: boolean;
  fileList: string[];
  currentFile: string;
  isFolderMode: boolean;
  compactMode: boolean;
  sidebarCollapsed: boolean;
  fontSize: 'small' | 'normal' | 'large' | 'xl';
  activeTag: string | null;
  pluginConfig: Record<string, any>;

  // Google Drive: avoid surprise auth popups during background reads.
  googleAuthRequired: boolean;

  // Fast file switching cache (stale-while-revalidate)
  fileCache: Record<string, FileCacheEntry>;

  // Sidebar indicator support: file -> has reminders file marker
  remindersLinkedByFile: Record<string, boolean>;
  
  // Actions
  setActiveTag: (tag: string | null) => void;
  setFontSize: (size: 'small' | 'normal' | 'large' | 'xl') => void;
  setCompactMode: (compact: boolean) => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  togglePlugin: (name: string) => void;
  setPluginConfig: (name: string, config: any) => void;
  setStorage: (adapterName: 'local' | 'fs' | 'google') => void;
  setGoogleDriveConfig: (config: GoogleDriveConfig) => Promise<void>;
  connectGoogleDrive: () => Promise<void>;
  pickGoogleDriveFolder: () => Promise<void>;
  pickGoogleDriveFile: () => Promise<void>;
  importGoogleDriveFiles: () => Promise<void>;
  switchGoogleAccount: () => Promise<void>;
  loadTodos: () => Promise<void>;
  refreshCurrentFile: (opts?: { background?: boolean; throwOnAuthRequired?: boolean }) => Promise<void>;
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
  selectFile: (filename: string, opts?: { interactiveAuth?: boolean }) => Promise<void>;
  renameFile: (oldName: string, newName: string) => Promise<void>;
  createFile: (filename: string) => Promise<void>;
  restoreSession: () => Promise<void>;
  grantPermission: () => Promise<void>;
  requiresPermission: boolean;
  restorableName: string;
  
  // Config Actions
  syncConfig: () => Promise<void>;
}

const adapters = {
  local: new LocalStorageAdapter(),
  fs: new FileSystemAdapter(),
  google: new GoogleDriveAdapter(),
};

const isGoogleAuthRequiredError = (e: any) => e?.code === 'google_auth_required';

const isUserEditingTask = () => {
  const active = document.activeElement;
  return !!(
    active &&
    (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT') &&
    (active as Element).closest('.task-item')
  );
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
    (set, get) => {
      // Coalesce concurrent reads per file and avoid out-of-order state updates.
      const inFlightReadByFile = new Map<string, Promise<{ content: string | null; meta?: FileMeta }>>();
      let activeReadToken = 0;

      // Initial state
      const initialState = {
        markdown: '',
        tasks: [],
        storage: adapters.local,
        configService: new ConfigService(adapters.local),
        isLoading: false,
        fileList: [],
        currentFile: '',
        isFolderMode: false,
        compactMode: false,
        sidebarCollapsed: false,
        fontSize: 'normal' as const,
        activeTag: null,
        pluginConfig: {},
        googleAuthRequired: false,
        fileCache: {},
        remindersLinkedByFile: {},
        requiresPermission: false,
        restorableName: '',
      };


      const readFileWithMeta = async (filename: string) => {
        const { storage } = get();
        if (storage.readWithMeta) {
          return storage.readWithMeta(filename);
        }
        const content = await storage.read(filename);
        return { content };
      };

      const persistCurrentFile = async (markdownToWrite: string, tasksToWrite: Task[]) => {
        const { storage, currentFile, isFolderMode, fileCache } = get();

        const targetFile = isFolderMode ? currentFile : 'todo.md';
        const cachedMeta = fileCache[targetFile]?.meta;

        try {
          if (storage.writeWithMeta && cachedMeta?.etag) {
            const result = await storage.writeWithMeta(targetFile, markdownToWrite, { ifMatch: cachedMeta.etag });
            set(state => ({
              fileCache: {
                ...state.fileCache,
                [targetFile]: {
                  markdown: markdownToWrite,
                  tasks: tasksToWrite,
                  meta: { ...cachedMeta, ...result.meta },
                  fetchedAt: Date.now(),
                },
              },
              remindersLinkedByFile: {
                ...state.remindersLinkedByFile,
                [targetFile]: hasRemindersFileMarker(markdownToWrite),
              },
            }));
            return;
          }

          await storage.write(targetFile, markdownToWrite);
          // Without metadata-aware writes, keep existing meta.
          set(state => ({
            fileCache: {
              ...state.fileCache,
              [targetFile]: {
                markdown: markdownToWrite,
                tasks: tasksToWrite,
                meta: cachedMeta,
                fetchedAt: Date.now(),
              },
            },
            remindersLinkedByFile: {
              ...state.remindersLinkedByFile,
              [targetFile]: hasRemindersFileMarker(markdownToWrite),
            },
          }));
        } catch (e: any) {
          if (e?.code === 'conflict') {
            alert('This file changed in the cloud while you were editing. Reloading the latest version.');
            await get().refreshCurrentFile({ background: false });
            return;
          }
          throw e;
        }
      };

      return ({
        ...initialState,

        syncConfig: async () => {
          const { configService } = get();
          
          // Migrate local settings if needed (one-time or if missing in config)
          await configService.migrateFromLocalStorage();
          
          const config = await configService.load();
          
          // Apply UI settings
          if (config.ui) {
            if (config.ui.fontSize) set({ fontSize: config.ui.fontSize });
            if (config.ui.compactMode !== undefined) set({ compactMode: config.ui.compactMode });
            if (config.ui.sidebarCollapsed !== undefined) set({ sidebarCollapsed: config.ui.sidebarCollapsed });
            if (config.ui.theme) {
               localStorage.setItem('theme', config.ui.theme);
            }
            if (config.ui.enabledPlugins) {
              Object.entries(config.ui.enabledPlugins).forEach(([name, enabled]) => {
                pluginRegistry.setPluginState(name, enabled);
              });
            }
          }
          
          // Apply Plugin settings
          if (config.plugins) {
            set({ pluginConfig: config.plugins });
          }
        },

        setActiveTag: (tag) => set({ activeTag: tag }),
        
        setFontSize: (size) => {
          set({ fontSize: size });
          get().configService.update(c => ({ ui: { ...c.ui, fontSize: size } }));
        },
        
        setCompactMode: (compact) => {
          set({ compactMode: compact });
          get().configService.update(c => ({ ui: { ...c.ui, compactMode: compact } }));
        },

        setSidebarCollapsed: (collapsed) => {
          set({ sidebarCollapsed: collapsed });
          get().configService.update(c => ({ ui: { ...c.ui, sidebarCollapsed: collapsed } }));
        },

        togglePlugin: (name) => {
          pluginRegistry.togglePlugin(name);
          // Sync new state to config
          const enabled = pluginRegistry.getPlugins().find(p => p.name === name)?.enabled ?? false;
          get().configService.update(c => ({ 
            ui: { 
              ...c.ui, 
              enabledPlugins: { 
                ...(c.ui?.enabledPlugins || {}), 
                [name]: enabled 
              } 
            } 
          }));
        },

        setPluginConfig: (name, config) => {
            set(state => ({
                pluginConfig: {
                    ...state.pluginConfig,
                    [name]: config
                }
            }));
            get().configService.update(c => ({
                plugins: {
                    ...(c.plugins || {}),
                    [name]: config
                }
            }));
        },


  setStorage: (adapterName) => {
    const adapter = adapters[adapterName];
    set({ 
      storage: adapter,
      configService: new ConfigService(adapter),
      googleAuthRequired: false,
    });
    get().syncConfig();
    localStorage.setItem('active-storage', adapterName);
    
    // Don't auto-load for FS, wait for user action
    if (adapterName === 'google') {
      // Keep storage switch lightweight.
      // We trigger interactive sign-in from an explicit user gesture (the storage switch click)
      // in App.tsx, which is iOS "Add to Home Screen" PWA friendly.
      set({ isFolderMode: true, fileList: [], currentFile: '' });
    } else if (adapterName !== 'fs') {
      get().loadTodos();
    }
  },

  setGoogleDriveConfig: async (config) => {
    adapters.google.setConfig(config);

    // iOS "Add to Home Screen" PWAs can be very strict about popups.
    // If sign-in needs to show a consent UI, we want requestAccessToken()
    // to run immediately on the user's tap without first awaiting script/init.
    // Pre-initialize in the background so the Connect button stays "user-gesture safe".
    adapters.google.init().catch(e => {
      console.error('Failed to pre-initialize Google Drive after config change', e);
    });
  },

  connectGoogleDrive: async () => {
    set({ isLoading: true });
    try {
      await adapters.google.signIn({ interactive: true });
      const files = await adapters.google.list('');
      set({ fileList: sortFiles(files), googleAuthRequired: false, isLoading: false, isFolderMode: true });

      const lastFile = localStorage.getItem('lastOpenedFile');
      if (lastFile && files.includes(lastFile)) {
        await get().selectFile(lastFile);
      } else if (files.length > 0) {
        await get().selectFile(files[0]);
      }
    } catch (e) {
      console.error('Failed to connect Google Drive', e);
      set({ isLoading: false, googleAuthRequired: isGoogleAuthRequiredError(e) });
    }
  },

  switchGoogleAccount: async () => {
    try {
      await adapters.google.switchAccount();
      // After switching, refresh the list
      const files = await adapters.google.list('');
      set({ fileList: sortFiles(files), googleAuthRequired: false });
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
            
            if (files.length === 0) {
                // Prompt user to import files
                // We now show a UI hint in the sidebar instead of a blocking alert
                // But we can still auto-trigger the import if we want to be helpful
                // Let's stick to the UI hint for now as it's less intrusive
            } else {
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

  importGoogleDriveFiles: async () => {
      try {
          const files = await adapters.google.pickFiles();
          if (files.length > 0) {
              // Refresh list
              const currentFiles = await adapters.google.list('');
              set({ fileList: sortFiles(currentFiles) });
              if (currentFiles.length > 0 && !get().currentFile) {
                  get().selectFile(currentFiles[0]);
              }
          }
      } catch (e) {
          console.error('Failed to import files', e);
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
    await get().refreshCurrentFile({ background: false });
  },

  refreshCurrentFile: async (opts) => {
    const background = !!opts?.background;
    const token = ++activeReadToken;

    const { currentFile, fileCache } = get();

    if (!background) {
      set({ isLoading: true, activeTag: null });
    }

    try {
      // Coalesce reads per file.
      let promise = inFlightReadByFile.get(currentFile);
      if (!promise) {
        promise = readFileWithMeta(currentFile);
        inFlightReadByFile.set(currentFile, promise);
      }

      const { content, meta } = await promise;
      // Clear inflight once resolved (even if reused).
      if (inFlightReadByFile.get(currentFile) === promise) {
        inFlightReadByFile.delete(currentFile);
      }

      // Ignore stale responses if user switched files while awaiting.
      if (token !== activeReadToken) return;

      const nextMarkdown = content || '# My Todo List\n\n- [ ] First task';
      const cached = fileCache[currentFile];

      // If background refresh and content unchanged, just update meta/fetchedAt.
      if (background && cached && cached.markdown === nextMarkdown) {
        set(state => ({
          fileCache: {
            ...state.fileCache,
            [currentFile]: { ...cached, meta: meta ?? cached.meta, fetchedAt: Date.now() },
          },
          remindersLinkedByFile: {
            ...state.remindersLinkedByFile,
            [currentFile]: hasRemindersFileMarker(nextMarkdown),
          },
          isLoading: false,
        }));
        return;
      }

      // Do not clobber the UI while user is editing a task.
      if (background && isUserEditingTask()) {
        return;
      }

      const nextTasks = parseTasks(nextMarkdown);
      set(state => ({
        markdown: nextMarkdown,
        tasks: nextTasks,
        isLoading: false,
        fileCache: {
          ...state.fileCache,
          [currentFile]: { markdown: nextMarkdown, tasks: nextTasks, meta, fetchedAt: Date.now() },
        },
        remindersLinkedByFile: {
          ...state.remindersLinkedByFile,
          [currentFile]: hasRemindersFileMarker(nextMarkdown),
        },
      }));
    } catch (e) {
      console.error('Failed to refresh file', e);
      if (isGoogleAuthRequiredError(e)) {
        set({ isLoading: false, googleAuthRequired: true });
        if (opts?.throwOnAuthRequired) throw e;
        return;
      }
      set({ isLoading: false });
    }
  },

  toggleTask: async (taskId) => {
    const { markdown } = get();
    const newMarkdown = toggleTaskInMarkdown(markdown, taskId);
    const tasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks });
    await persistCurrentFile(newMarkdown, tasks);
  },

  addTask: async (text) => {
    const { markdown } = get();
    const newMarkdown = addTaskToMarkdown(markdown, text);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  updateTaskText: async (taskId, newText) => {
    const { markdown, tasks: oldTasks } = get();
    const index = oldTasks.findIndex(t => t.id === taskId);

    const newMarkdown = updateTaskTextInMarkdown(markdown, taskId, newText);
    const newTasks = parseTasks(newMarkdown);
    
    set({ markdown: newMarkdown, tasks: newTasks });

    await persistCurrentFile(newMarkdown, newTasks);

    if (index !== -1 && newTasks[index]) {
      return newTasks[index].id;
    }
    return undefined;
  },

  deleteTask: async (taskId) => {
    const { markdown } = get();
    const newMarkdown = deleteTaskInMarkdown(markdown, taskId);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  insertTaskAfter: async (taskId, text) => {
    const { markdown } = get();
    const newMarkdown = insertTaskAfterInMarkdown(markdown, taskId, text);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
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
    const { markdown } = get();
    const newMarkdown = reorderTaskInMarkdown(markdown, activeId, overId);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  nestTask: async (activeId, overId) => {
    const { markdown } = get();
    const newMarkdown = nestTaskInMarkdown(markdown, activeId, overId);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  updateMarkdown: async (newMarkdown) => {
    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  updateTaskDescription: async (taskId, description) => {
    const { markdown } = get();
    const newMarkdown = updateTaskDescriptionInMarkdown(markdown, taskId, description);

    const newTasks = parseTasks(newMarkdown);
    set({ markdown: newMarkdown, tasks: newTasks });
    await persistCurrentFile(newMarkdown, newTasks);
  },

  renameFile: async (oldName, newName) => {
    const { storage, fileList, currentFile } = get();
    
    // Ensure extension
    if (!newName.endsWith('.md') && !newName.endsWith('.markdown')) {
      newName += '.md';
    }

    await storage.rename(oldName, newName);
    
    const newFileList = fileList.map(f => f === oldName ? newName : f);
    set({ fileList: newFileList });
    // Update persisted order
    localStorage.setItem('file-order', JSON.stringify(newFileList));
    
    if (currentFile === oldName) {
      set({ currentFile: newName });
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
    // Warm Google Drive scripts/token client in the background.
    // This improves the chance that user-initiated auth popups are allowed in iOS A2HS PWAs
    // because requestAccessToken() can run immediately on tap without awaiting init.
    const activeStoragePref = localStorage.getItem('active-storage');
    if (activeStoragePref !== 'google') {
      const config = adapters.google.getConfig();
      if (config?.clientId && config.apiKey) {
        adapters.google.init().catch(e => {
          console.error('Failed to pre-initialize Google Drive on startup', e);
        });
      }
    }

    // Try to restore Google Drive session first
    const activeStorage = localStorage.getItem('active-storage');
    if (activeStorage === 'google') {
      const config = adapters.google.getConfig();
      if (config) {
        set({ 
          storage: adapters.google, 
          configService: new ConfigService(adapters.google),
          isFolderMode: true,
          googleAuthRequired: false,
        });
        get().syncConfig();
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
          if (isGoogleAuthRequiredError(e)) {
            set({ fileList: [], googleAuthRequired: true, isFolderMode: true });
            return;
          }
          // Fall through to FS restore if Google fails for non-auth reasons
        }
      }
    }

    const fsAdapter = adapters.fs;
    const mode = await fsAdapter.restore();
    
    if (mode) {
      const status = await fsAdapter.checkPermissionStatus();
      
      if (status === 'granted') {
        set({ 
          storage: fsAdapter, 
          configService: new ConfigService(fsAdapter),
          isFolderMode: mode === 'folder' 
        });
        get().syncConfig();
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
          configService: new ConfigService(fsAdapter),
          isFolderMode: mode === 'folder'
        });
      }
    } else {
      localStorage.setItem('active-storage', 'local');
      get().syncConfig();
      get().loadTodos();
    }
  },

  grantPermission: async () => {
    const { storage, isFolderMode } = get();
    if (storage instanceof FileSystemAdapter) {
      const granted = await storage.requestPermissionAccess();
      if (granted) {
        set({ requiresPermission: false });
        get().syncConfig();
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
        set({ storage: adapter, isFolderMode: true, googleAuthRequired: false });
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
        set({ storage: adapter, isFolderMode: false, googleAuthRequired: false });
        const files = await adapter.list('');
        if (files.length > 0) {
          set({ currentFile: files[0] });
          get().loadTodos();
        }
      }
      return success;
    }
  },

  selectFile: async (filename, opts) => {
    const previousFile = get().currentFile;
    const previousCached = previousFile ? get().fileCache[previousFile] : undefined;

    const nextFile = filename;
    const cached = get().fileCache[nextFile];

    set({
      currentFile: nextFile,
      googleAuthRequired: false,
      // If we have cache, switch instantly without spinner.
      ...(cached ? { markdown: cached.markdown, tasks: cached.tasks, isLoading: false } : { isLoading: true }),
    });
    localStorage.setItem('lastOpenedFile', nextFile);

    try {
      // Background refresh to update cache/UI if needed.
      await get().refreshCurrentFile({ background: !!cached, throwOnAuthRequired: !cached });
    } catch (e) {
      if (isGoogleAuthRequiredError(e)) {
        // If the user explicitly initiated the file switch, try to re-auth once.
        if (opts?.interactiveAuth) {
          try {
            set({ isLoading: true });
            await adapters.google.signIn({ interactive: true });
            set({ googleAuthRequired: false });
            await get().refreshCurrentFile({ background: !!cached, throwOnAuthRequired: true });
            return;
          } catch (reauthErr) {
            console.error('Google Drive re-auth failed', reauthErr);
          } finally {
            set({ isLoading: false });
          }
        }

        set({
          googleAuthRequired: true,
          isLoading: false,
          ...(previousFile
            ? {
                currentFile: previousFile,
                ...(previousCached
                  ? { markdown: previousCached.markdown, tasks: previousCached.tasks }
                  : {}),
              }
            : {}),
        });
        return;
      }
      throw e;
    }
  },
      });
    },
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
