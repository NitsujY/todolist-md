import { useEffect, useState, useCallback } from 'react';
import { useStore } from 'zustand';
import { useTodoStore } from './store/useTodoStore';
import { pluginRegistry } from './plugins/pluginEngine';
import { Settings, FileText, Cloud, RefreshCw, FolderOpen, Eye, EyeOff, Trash2, Power, Package, Save, Code, List, HardDrive, Menu, File, Edit2, Heading, Plus, Search, X, Tag } from 'lucide-react';
import { TaskItem } from './components/TaskItem';
import {
  DndContext, 
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragOverlay,
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

function SortableFileItem({ file, currentFile, onSelect, onRename }: { file: string, currentFile: string, onSelect: (f: string) => void, onRename: (f: string) => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: file, data: { type: 'file', file } });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners} className="group flex items-center gap-1 pr-2 rounded-lg hover:bg-base-200 transition-colors">
      <button
        onClick={() => onSelect(file)}
        className={`flex-1 text-left px-3 py-2 text-sm flex items-center gap-2 truncate ${currentFile === file ? 'text-primary font-medium' : 'text-base-content/70'}`}
      >
        <File size={14} />
        <span className="truncate">{file}</span>
      </button>
      <button 
        onClick={(e) => {
          e.stopPropagation();
          onRename(file);
        }}
        className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity"
        title="Rename"
      >
        <Edit2 size={12} />
      </button>
    </div>
  );
}

function App() {
  const { 
    tasks, 
    markdown, 
    isLoading, 
    loadTodos, 
    toggleTask, 
    deleteTask,
    updateMarkdown,
    setStorage,
    openFileOrFolder,
    selectFile,
    fileList,
    currentFile,
    isFolderMode,
    updateTaskText,
    updateTaskDescription,
    renameFile,
    reorderTasks,
    insertTaskAfter,
    reorderFiles,
    createFile,
    restoreSession,
    requiresPermission,
    restorableName,
    grantPermission,
    compactMode,
    setCompactMode,
    fontSize,
    setFontSize,
    activeTag,
    setActiveTag,
    addTask
  } = useTodoStore();

  // Access temporal store for undo/redo
  const { undo, redo } = useStore(useTodoStore.temporal, (state) => state);

  const [showSettings, setShowSettings] = useState(false);
  const [activeStorage, setActiveStorage] = useState<'local' | 'fs' | 'google'>(() => {
    return (localStorage.getItem('active-storage') as 'local' | 'fs' | 'google') || 'local';
  });
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [rawMarkdown, setRawMarkdown] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [, setPluginUpdate] = useState(0); // Force re-render for plugins
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [showSidebar, setShowSidebar] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed');
    return saved ? JSON.parse(saved) : true;
  });
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isResizing, setIsResizing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [activeFileId, setActiveFileId] = useState<string | null>(null);

  const handleFileDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveFileId(null);
    
    if (over && active.id !== over.id) {
      reorderFiles(active.id as string, over.id as string);
    }
  };

  const handleFileDragStart = (event: DragStartEvent) => {
    setActiveFileId(event.active.id as string);
  };

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(showSidebar));
  }, [showSidebar]);

  const startResizing = useCallback(() => {
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
  }, []);

  const resize = useCallback(
    (mouseMoveEvent: MouseEvent) => {
      if (isResizing) {
        const newWidth = mouseMoveEvent.clientX;
        if (newWidth < 150) {
          setShowSidebar(false);
          setIsResizing(false);
        } else if (newWidth >= 200 && newWidth <= 600) {
          setSidebarWidth(newWidth);
        }
      }
    },
    [isResizing]
  );

  useEffect(() => {
    window.addEventListener("mousemove", resize);
    window.addEventListener("mouseup", stopResizing);
    return () => {
      window.removeEventListener("mousemove", resize);
      window.removeEventListener("mouseup", stopResizing);
    };
  }, [resize, stopResizing]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [targetFocusId, setTargetFocusId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Keyboard shortcuts for Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        if (e.shiftKey) {
          redo();
        } else {
          undo();
        }
        e.preventDefault();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    restoreSession();
    
    // Initialize theme state
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | 'auto';
    if (savedTheme) setCurrentTheme(savedTheme);
    
    // Register a demo plugin
    pluginRegistry.register({
      name: 'PriorityHighlighter',
      onTaskRender: (task) => {
        if (task.text.toLowerCase().includes('urgent')) {
          return <span className="ml-2 text-xs bg-red-500 text-white px-1 rounded">URGENT</span>;
        }
        return null;
      }
    });

    // Core plugins are now registered in main.tsx
    
    // Register Gamify Plugin (Conditional)
    if (import.meta.env.VITE_ENABLE_GAMIFY !== 'false') {
      // Use glob import to make it optional at build time
      const modules = import.meta.glob('./plugins/gamify-plugin/GamifyPlugin.tsx');
      for (const path in modules) {
        modules[path]().then((mod: any) => {
          if (mod.GamifyPlugin) {
            pluginRegistry.register(new mod.GamifyPlugin(), false);
            setPluginUpdate(prev => prev + 1);
          }
        });
      }
    }
    
    // Force re-render to show plugins
    setPluginUpdate(prev => prev + 1);
  }, [loadTodos, restoreSession]);

  useEffect(() => {
    setRawMarkdown(markdown);
  }, [markdown]);
  const handleStorageChange = async (type: 'local' | 'fs' | 'google') => {
    if (type === 'fs') {
      // For FS, we need to ask if they want file or folder
      // But for now, let's default to folder as requested, or ask?
      // The user said "I guess for local file, I should be able to select a folder"
      // Let's try to open folder first
      const success = await openFileOrFolder('folder');
      if (success) {
        setActiveStorage('fs');
      }
    } else if (type === 'google') {
      setActiveStorage('google');
      setStorage('google');
    } else {
      setActiveStorage(type);
      setStorage(type);
    }
    (document.activeElement as HTMLElement)?.blur();
  };

  const handleSaveRaw = () => {
    updateMarkdown(rawMarkdown);
    setIsEditingRaw(false);
  };

  const handleTogglePlugin = (name: string) => {
    pluginRegistry.togglePlugin(name);
    setPluginUpdate(prev => prev + 1);
  };

  const handleUninstallPlugin = (name: string) => {
    if (confirm(`Are you sure you want to uninstall ${name}?`)) {
      pluginRegistry.unregister(name);
      setPluginUpdate(prev => prev + 1);
    }
  };

  const handleInstallPlugin = () => {
    const name = prompt("Enter plugin name to install (Mock):");
    if (name) {
      pluginRegistry.register({
        name: name,
        onTaskRender: () => <span className="badge badge-xs badge-info">New</span>
      });
      setPluginUpdate(prev => prev + 1);
    }
  };

  const handleCreateFile = async () => {
    const filename = prompt('Enter filename for new list:', 'new-list.md');
    if (filename) {
      await createFile(filename);
    }
  };

  const handleRenameFile = async (oldName: string) => {
    const newName = prompt('Enter new file name:', oldName);
    if (newName && newName !== oldName) {
      try {
        await renameFile(oldName, newName);
      } catch (e: any) {
        alert(`Failed to rename file: ${e.message}`);
      }
    }
  };

  const handleSetTheme = (theme: 'light' | 'dark' | 'auto') => {
    setCurrentTheme(theme);
    if (theme === 'light') pluginRegistry.actions.get('setThemeLight')?.();
    if (theme === 'dark') pluginRegistry.actions.get('setThemeDark')?.();
    if (theme === 'auto') pluginRegistry.actions.get('setThemeAuto')?.();
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    setDragOffset(0);
  };

  const handleDragMove = (event: any) => {
    setDragOffset(event.delta.x);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over, delta } = event;
    
    if (over) {
      // Check for nesting (indentation)
      // If delta.x is positive (moved right) significantly (> 15px)
      if (delta.x > 15) {
        // Find the new index where the item would land
        const activeIndex = tasks.findIndex(t => t.id === active.id);
        const overIndex = tasks.findIndex(t => t.id === over.id);
        
        // Calculate the hypothetical new list order
        const newTasks = arrayMove(tasks, activeIndex, overIndex);
        
        // The item is now at 'overIndex' in 'newTasks'.
        // The candidate parent is the item immediately preceding it.
        if (overIndex > 0) {
          const parentCandidate = newTasks[overIndex - 1];
          // Prevent nesting under itself (impossible by definition but good to check)
          if (parentCandidate.id !== active.id) {
             useTodoStore.getState().nestTask(active.id as string, parentCandidate.id);
             setActiveId(null);
             setDragOffset(0);
             return;
          }
        }
      }
      
      if (active.id !== over.id) {
        reorderTasks(active.id as string, over.id as string);
      }
    }
    setActiveId(null);
    setDragOffset(0);
  };

  const handleAddNext = (id: string) => {
    insertTaskAfter(id, '');
    setFocusId(id);
  };

  useEffect(() => {
    if (focusId) {
      const index = tasks.findIndex(t => t.id === focusId);
      if (index !== -1 && index < tasks.length - 1) {
        const nextTask = tasks[index + 1];
        setTargetFocusId(nextTask.id);
        setFocusId(null);
      }
    }
  }, [tasks, focusId]);

     const filteredTasks = tasks.filter(t => {
    if (activeTag && (!t.tags || !t.tags.includes(activeTag))) return false;
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      t.text.toLowerCase().includes(query) || 
      (t.description && t.description.toLowerCase().includes(query))
    );
  });

  // Calculate unique tags
  const allTags = Array.from(new Set(tasks.flatMap(t => t.tags || []))).sort();

  return (
    <div className="flex flex-col h-screen bg-base-200 font-sans overflow-hidden">
      
      {requiresPermission && (
        <div className="bg-warning text-warning-content px-4 py-2 text-sm flex items-center justify-between shadow-md z-[60]">
          <div className="flex items-center gap-2">
            <HardDrive size={16} />
            <span className="font-medium">Resume working in "{restorableName}"?</span>
          </div>
          <button 
            onClick={() => grantPermission()} 
            className="btn btn-sm btn-ghost bg-warning-content/10 hover:bg-warning-content/20 border-0 text-warning-content"
          >
            Allow Access
          </button>
        </div>
      )}

      {/* Top Navigation Bar */}
      <div className="navbar bg-base-100 shadow-sm z-50 px-4 border-b border-base-300 h-14 min-h-0">
        <div className="flex-none">
          {isFolderMode && (
            <button onClick={() => setShowSidebar(!showSidebar)} className="btn btn-ghost btn-square btn-sm mr-2">
              <Menu size={20} />
            </button>
          )}
        </div>
        <div className="flex-1">
          <a className="btn btn-ghost btn-sm text-lg text-primary gap-2 font-bold tracking-tight">
            <FileText size={20} className="text-primary" />
            TodoMD
          </a>
        </div>
        <div className="flex-none gap-1">
          <div className="w-px h-4 bg-base-300 mx-1"></div>

          <button onClick={() => loadTodos()} className="btn btn-ghost btn-square btn-sm" title="Refresh">
            <RefreshCw size={16} />
          </button>

          <button 
            onClick={() => setIsEditingRaw(!isEditingRaw)}
            className={`btn btn-square btn-sm ${isEditingRaw ? 'btn-primary text-primary-content' : 'btn-ghost'}`}
            title={isEditingRaw ? 'View List' : 'Edit Markdown'}
          >
            {isEditingRaw ? <List size={18} /> : <Code size={18} />}
          </button>

          <button onClick={() => setShowSettings(true)} className="btn btn-ghost btn-square btn-sm" title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        
        {/* Sidebar */}
        {isFolderMode && showSidebar && (
          <aside 
            style={{ width: sidebarWidth }}
            className="bg-base-100 border-r border-base-300 flex flex-col overflow-hidden relative group/sidebar flex-shrink-0"
          >
            {/* Resizer Handle */}
            <div
              className="absolute right-0 top-0 w-1 h-full cursor-col-resize hover:bg-primary/50 active:bg-primary z-50 transition-colors"
              onMouseDown={startResizing}
            />

            {/* Plugin Dashboards */}
            {pluginRegistry.getDashboards().length > 0 && (
              <div className="p-4 pb-0 space-y-4">
                {pluginRegistry.getDashboards().map((dashboard, i) => (
                  <div key={i}>{dashboard}</div>
                ))}
              </div>
            )}

            <div className="p-4 font-bold text-sm text-base-content/50 uppercase tracking-wider flex justify-between items-center">
              <span>Files</span>
              <div className="flex gap-1">
                <button onClick={handleCreateFile} className="btn btn-ghost btn-xs btn-square" title="New File">
                  <Plus size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <DndContext 
                sensors={sensors} 
                collisionDetection={closestCenter} 
                onDragEnd={handleFileDragEnd}
                onDragStart={handleFileDragStart}
              >
                <SortableContext items={fileList} strategy={verticalListSortingStrategy}>
                  {fileList.map(file => (
                    <SortableFileItem 
                      key={file} 
                      file={file} 
                      currentFile={currentFile} 
                      onSelect={selectFile} 
                      onRename={handleRenameFile} 
                    />
                  ))}
                </SortableContext>
                <DragOverlay>
                  {activeFileId ? (
                    <div className="flex items-center gap-1 pr-2 rounded-lg bg-base-200 p-2 opacity-80 shadow-md border border-base-300">
                      <File size={14} />
                      <span className="truncate">{activeFileId}</span>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
              {fileList.length === 0 && (
                <div className="text-center p-4 text-base-content/40 text-sm">No markdown files found</div>
              )}
            </div>

            {/* Tags Section */}
            {allTags.length > 0 && (
              <>
                <div className="p-4 pt-2 font-bold text-sm text-base-content/50 uppercase tracking-wider flex justify-between items-center border-t border-base-200 mt-2">
                  <span>Tags</span>
                  {activeTag && (
                    <button onClick={() => setActiveTag(null)} className="btn btn-ghost btn-xs text-xs font-normal normal-case opacity-50 hover:opacity-100">
                      Clear
                    </button>
                  )}
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-1 min-h-[100px]">
                  {allTags.map(tag => (
                    <button
                      key={tag}
                      onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition-colors ${activeTag === tag ? 'bg-primary/10 text-primary font-medium' : 'text-base-content/70 hover:bg-base-200'}`}
                    >
                      <Tag size={14} />
                      <span className="truncate">#{tag}</span>
                      <span className="ml-auto text-xs opacity-50">
                        {tasks.filter(t => t.tags?.includes(tag)).length}
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </aside>
        )}

        {/* Main Task View */}
        <main className={`flex-1 overflow-hidden w-full relative p-0 ${compactMode ? 'sm:p-2' : 'sm:p-4'} bg-base-200/50`}>
          <div className="h-full max-w-5xl mx-auto flex flex-col bg-base-100 sm:rounded-xl sm:shadow-sm sm:border border-base-300 overflow-hidden">
            
            {/* Header & Controls */}
            <div className={`flex justify-between items-center border-b border-base-200 bg-base-50/50 ${compactMode ? 'p-2 h-[56px]' : 'p-4 h-[72px]'}`}>
              <div className="flex items-center gap-3 flex-1 mr-4 min-w-0">
                <div className="dropdown dropdown-bottom flex-shrink-0">
                  <div tabIndex={0} role="button" className="btn btn-ghost btn-sm gap-2 px-2">
                    {activeStorage === 'local' && <HardDrive size={18} />}
                    {activeStorage === 'fs' && <FolderOpen size={18} />}
                    {activeStorage === 'google' && <Cloud size={18} className="text-success" />}
                    <span className="hidden sm:inline text-xs opacity-70 font-normal">
                      {activeStorage === 'local' && 'Local'}
                      {activeStorage === 'fs' && 'Folder'}
                      {activeStorage === 'google' && 'Drive'}
                    </span>
                  </div>
                  <ul tabIndex={0} className="dropdown-content z-[50] menu p-2 shadow bg-base-100 rounded-box w-52 border border-base-200">
                    <li><a onClick={() => handleStorageChange('local')} className={activeStorage === 'local' ? 'active' : ''}><HardDrive size={16} /> Browser Cache (Temp)</a></li>
                    <li><a onClick={() => handleStorageChange('fs')} className={activeStorage === 'fs' ? 'active' : ''}><FolderOpen size={16} /> Local Folder</a></li>
                    <li><a onClick={() => handleStorageChange('google')} className={activeStorage === 'google' ? 'active' : ''}><Cloud size={16} /> Google Drive</a></li>
                    {activeStorage === 'google' && (
                      <li className="ml-4 border-l border-base-200">
                        <a onClick={() => useTodoStore.getState().pickGoogleDriveFolder()} className="text-xs">
                          <FolderOpen size={14} /> Select Folder
                        </a>
                        <a onClick={() => useTodoStore.getState().pickGoogleDriveFile()} className="text-xs">
                          <FileText size={14} /> Open File
                        </a>
                        <a onClick={() => useTodoStore.getState().switchGoogleAccount()} className="text-xs">
                          <RefreshCw size={14} /> Switch Account
                        </a>
                      </li>
                    )}
                  </ul>
                </div>

                <h1 className="text-xl font-bold text-base-content truncate flex-shrink-0 max-w-[200px] sm:max-w-md">
                  {isFolderMode ? currentFile : 'My Tasks'}
                </h1>
              </div>
              
              <div className="flex items-center gap-1">
                {isSearchOpen ? (
                  <div className="relative w-48 sm:w-64 animate-in fade-in slide-in-from-right-2 duration-200 mr-1">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40" />
                    <input 
                      autoFocus
                      type="text" 
                      placeholder="Search..." 
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          setSearchQuery('');
                          setIsSearchOpen(false);
                        }
                      }}
                      onBlur={() => {
                        if (!searchQuery) setIsSearchOpen(false);
                      }}
                      className="input input-sm input-bordered w-full pl-9 pr-8 bg-base-100 focus:outline-none focus:border-primary/50"
                    />
                    <button 
                      onClick={() => {
                        setSearchQuery('');
                        setIsSearchOpen(false);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-base-content"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setIsSearchOpen(true)}
                    className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                    title="Search"
                  >
                    <Search size={18} />
                  </button>
                )}
                <button
                  onClick={() => {
                    updateMarkdown(markdown + '\n\n# New Section\n');
                  }}
                  className="btn btn-ghost btn-xs btn-square text-base-content/60 hover:text-primary"
                  title="Add Section"
                >
                  <Heading size={18} />
                </button>

                <button 
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="btn btn-xs btn-ghost btn-square text-base-content/60 hover:text-primary"
                  title={showCompleted ? 'Hide Done' : 'Show Done'}
                >
                  {showCompleted ? <Eye size={18} /> : <EyeOff size={18} />}
                </button>

                {/* Plugin Header Buttons */}
                {pluginRegistry.renderHeaderButtons()}
              </div>
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center flex-1 text-base-content/50">
                <span className="loading loading-spinner loading-lg text-primary"></span>
                <span className="mt-4 text-sm">Loading tasks...</span>
              </div>
            ) : isEditingRaw ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                <textarea 
                  className="textarea textarea-ghost flex-1 w-full p-6 font-mono text-sm resize-none focus:outline-none leading-relaxed"
                  value={rawMarkdown}
                  onChange={(e) => setRawMarkdown(e.target.value)}
                  spellCheck={false}
                />
                <div className="p-3 border-t border-base-200 flex justify-end bg-base-50">
                  <button onClick={handleSaveRaw} className="btn btn-primary btn-sm gap-2">
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col flex-1 overflow-hidden relative">
                {/* Task List */}
                <div className="flex-1 overflow-y-auto">
                  {filteredTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-content/40">
                      {tasks.length === 0 ? (
                        isFolderMode && fileList.length === 0 ? (
                          <>
                            <FolderOpen size={48} className="mb-2 opacity-20" />
                            <p className="mb-4">This folder is empty</p>
                            <button onClick={handleCreateFile} className="btn btn-primary gap-2">
                              <Plus size={16} /> Create New File
                            </button>
                          </>
                        ) : (
                          <>
                            <Package size={48} className="mb-2 opacity-20" />
                            <p>No tasks found</p>
                            <button onClick={() => addTask('New task')} className="btn btn-primary btn-sm mt-4 gap-2">
                              <Plus size={16} /> Add First Task
                            </button>
                          </>
                        )
                      ) : (
                        <>
                          <Search size={48} className="mb-2 opacity-20" />
                          <p>No matching tasks found</p>
                          <button onClick={() => setSearchQuery('')} className="btn btn-ghost btn-sm mt-2">
                            Clear Search
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragMove={handleDragMove}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={filteredTasks.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col divide-y divide-base-200 pb-20">
                          {filteredTasks.map(task => (
                            <TaskItem 
                              key={task.id} 
                              task={task} 
                              onToggle={toggleTask} 
                              onUpdate={updateTaskText}
                              onUpdateDescription={updateTaskDescription}
                              onAddNext={handleAddNext}
                              onDelete={deleteTask}
                              showCompleted={showCompleted}
                              autoFocus={task.id === targetFocusId}
                              compact={compactMode}
                              fontSize={fontSize}
                            />
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {activeId ? (
                          <div 
                            className="p-4 bg-base-100 border border-base-300 rounded shadow-lg opacity-90 flex items-start gap-3"
                            style={{
                              marginLeft: dragOffset > 15 ? '24px' : '0',
                              borderLeft: dragOffset > 15 ? '4px solid var(--color-primary)' : '1px solid var(--color-base-300)'
                            }}
                          >
                             <div className="mt-1 text-base-content/30">
                               <div className="w-5 h-5 border-2 border-base-300 rounded-md" />
                             </div>
                             <div className="flex-1 min-w-0 text-sm leading-relaxed">
                               {tasks.find(t => t.id === activeId)?.text}
                             </div>
                          </div>
                        ) : null}
                      </DragOverlay>
                    </DndContext>
                  )}
                </div>
                <div className="p-2 text-center text-xs text-base-content/30 border-t border-base-200 bg-base-50">
                  <a href="/privacy.html" target="_blank" className="hover:text-primary">Privacy Policy</a>
                  <span className="mx-2">•</span>
                  <a href="/terms.html" target="_blank" className="hover:text-primary">Terms of Service</a>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <form method="dialog">
              <button onClick={() => setShowSettings(false)} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
            </form>
            <h3 className="font-bold text-lg mb-6">Settings</h3>
            
            <div className="space-y-6">
              
              {/* Storage settings moved to navbar */}
              
              {/* Theme Section */}
              <div>
                <h4 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider mb-3">Appearance</h4>
                <div className="join w-full">
                  <button 
                    onClick={() => handleSetTheme('light')} 
                    className={`btn join-item flex-1 btn-sm ${currentTheme === 'light' ? 'btn-active btn-primary' : ''}`}
                  >
                    Light
                  </button>
                  <button 
                    onClick={() => handleSetTheme('dark')} 
                    className={`btn join-item flex-1 btn-sm ${currentTheme === 'dark' ? 'btn-active btn-primary' : ''}`}
                  >
                    Dark
                  </button>
                  <button 
                    onClick={() => handleSetTheme('auto')} 
                    className={`btn join-item flex-1 btn-sm ${currentTheme === 'auto' ? 'btn-active btn-primary' : ''}`}
                  >
                    Auto
                  </button>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Font Family</span>
                  </div>
                  <select 
                    className="select select-bordered select-sm w-full"
                    defaultValue={localStorage.getItem('font-preference') || 'system'}
                    onChange={(e) => {
                      const font = e.target.value;
                      switch(font) {
                        case 'inter': pluginRegistry.actions.get('setFontInter')?.(); break;
                        case 'roboto-mono': pluginRegistry.actions.get('setFontRobotoMono')?.(); break;
                        case 'fira-code': pluginRegistry.actions.get('setFontFiraCode')?.(); break;
                        case 'system': pluginRegistry.actions.get('setFontSystem')?.(); break;
                      }
                    }}
                  >
                    <option value="system">System UI</option>
                    <option value="inter">Inter</option>
                    <option value="roboto-mono">Roboto Mono</option>
                    <option value="fira-code">Fira Code</option>
                  </select>
                </div>

                <div className="mt-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm font-medium">Font Size</span>
                    <span className="text-xs text-base-content/50 capitalize">{fontSize}</span>
                  </div>
                  <input 
                    type="range" 
                    min="0" 
                    max="3" 
                    value={fontSize === 'small' ? 0 : fontSize === 'normal' ? 1 : fontSize === 'large' ? 2 : 3} 
                    onChange={(e) => {
                      const val = parseInt(e.target.value);
                      const sizes: ('small' | 'normal' | 'large' | 'xl')[] = ['small', 'normal', 'large', 'xl'];
                      setFontSize(sizes[val]);
                    }}
                    className="range range-primary range-xs" 
                    step="1" 
                  />
                  <div className="w-full flex justify-between text-xs px-2 mt-1 text-base-content/50">
                    <span>S</span>
                    <span>M</span>
                    <span>L</span>
                    <span>XL</span>
                  </div>
                </div>
                
                <div className="form-control mt-4">
                  <label className="label cursor-pointer justify-start gap-3">
                    <input 
                      type="checkbox" 
                      className="toggle toggle-primary toggle-sm" 
                      checked={compactMode} 
                      onChange={(e) => setCompactMode(e.target.checked)}
                    />
                    <span className="label-text font-medium">Compact Mode</span>
                  </label>
                </div>
              </div>

              <div className="divider my-2"></div>

              {/* Plugins Section */}
              <div>
                <div className="flex justify-between items-center mb-3">
                  <h4 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider">Plugins</h4>
                  <button onClick={handleInstallPlugin} className="btn btn-xs btn-ghost text-primary">+ Install</button>
                </div>
                
                <div className="space-y-2">
                  {pluginRegistry.getPlugins().map((p) => (
                    <div key={p.name} className="flex flex-col sm:flex-row sm:items-center justify-between p-3 bg-base-200 rounded-lg gap-3">
                      <div className="flex items-center gap-3 shrink-0">
                        <div className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-success' : 'bg-base-content/20'}`}></div>
                        <span className={p.enabled ? 'font-medium' : 'text-base-content/50'}>{p.name}</span>
                        {p.isSystem && <span className="badge badge-xs badge-ghost">System</span>}
                      </div>
                      <div className="flex items-center gap-2 w-full sm:w-auto justify-end flex-wrap">
                        {p.enabled && p.instance.renderSettings && (
                          <div className="mr-2">
                            {p.instance.renderSettings()}
                          </div>
                        )}
                        {!p.isSystem && (
                          <>
                            <button 
                              onClick={() => handleTogglePlugin(p.name)}
                              className={`btn btn-circle btn-xs ${p.enabled ? 'btn-success text-white' : 'btn-ghost'}`}
                              title={p.enabled ? 'Disable' : 'Enable'}
                            >
                              <Power size={12} />
                            </button>
                            <button 
                              onClick={() => handleUninstallPlugin(p.name)}
                              className="btn btn-circle btn-xs btn-ghost text-error"
                              title="Uninstall"
                            >
                              <Trash2 size={12} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            <div className="text-center text-xs text-base-content/30 mt-8 flex flex-col gap-2">
              <span>v{__APP_VERSION__}</span>
              <div className="flex justify-center gap-3">
                <a href="/privacy.html" target="_blank" className="hover:text-primary underline">Privacy Policy</a>
                <a href="/terms.html" target="_blank" className="hover:text-primary underline">Terms of Service</a>
              </div>
            </div>
            
            <div className="modal-action">
              <button onClick={() => setShowSettings(false)} className="btn">Close</button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowSettings(false)}>close</button>
          </form>
        </dialog>
      )}

      {/* Google Config Modal Removed */}
    </div>
  );
}

export default App;