import { useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { useTodoStore } from './store/useTodoStore';
import { pluginRegistry } from './plugins/pluginEngine';
import { Settings, FileText, Cloud, RefreshCw, FolderOpen, Eye, EyeOff, Trash2, Power, Package, Save, Code, List, HardDrive, Menu, File, Edit2, Heading, Plus } from 'lucide-react';
import { ThemePlugin } from './plugins/ThemePlugin';
import { DueDatePlugin } from './plugins/DueDatePlugin';
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
} from '@dnd-kit/sortable';

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
    createFile,
    restoreSession,
    requiresPermission,
    restorableName,
    grantPermission
  } = useTodoStore();

  // Access temporal store for undo/redo
  const { undo, redo } = useStore(useTodoStore.temporal, (state) => state);

  const [showSettings, setShowSettings] = useState(false);
  const [activeStorage, setActiveStorage] = useState<'local' | 'cloud' | 'fs'>('local');
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [rawMarkdown, setRawMarkdown] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);
  const [, setPluginUpdate] = useState(0); // Force re-render for plugins
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'auto'>('auto');
  const [showSidebar, setShowSidebar] = useState(true);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [targetFocusId, setTargetFocusId] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor),
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

    // Register Theme Plugin
    pluginRegistry.register(new ThemePlugin(), true); // System plugin
    // Register Due Date Plugin
    pluginRegistry.register(new DueDatePlugin(), true); // System plugin
  }, [loadTodos, restoreSession]);

  useEffect(() => {
    setRawMarkdown(markdown);
  }, [markdown]);

  useEffect(() => {
    const handleFocus = () => {
      if (activeStorage === 'fs' || activeStorage === 'local') {
        loadTodos();
      }
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [activeStorage, loadTodos]);

  const handleStorageChange = async (type: 'local' | 'cloud' | 'fs') => {
    if (type === 'fs') {
      // For FS, we need to ask if they want file or folder
      // But for now, let's default to folder as requested, or ask?
      // The user said "I guess for local file, I should be able to select a folder"
      // Let's try to open folder first
      await openFileOrFolder('folder');
      setActiveStorage('fs');
    } else {
      setActiveStorage(type);
      setStorage(type);
    }
    
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
      await renameFile(oldName, newName);
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
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      reorderTasks(active.id as string, over.id as string);
    }
    setActiveId(null);
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
          <aside className="w-64 bg-base-100 border-r border-base-300 flex flex-col overflow-hidden transition-all duration-300">
            <div className="p-4 font-bold text-sm text-base-content/50 uppercase tracking-wider flex justify-between items-center">
              <span>Files</span>
              <div className="flex gap-1">
                <button onClick={handleCreateFile} className="btn btn-ghost btn-xs btn-square" title="New File">
                  <Plus size={14} />
                </button>
                <button onClick={() => openFileOrFolder('folder')} className="btn btn-ghost btn-xs btn-square" title="Open Folder">
                  <FolderOpen size={14} />
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              <button 
                onClick={handleCreateFile}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-base-content/60 hover:text-primary hover:bg-base-200 rounded-lg transition-colors mb-2 border border-dashed border-base-300"
              >
                <Plus size={14} />
                <span>New File...</span>
              </button>
              {fileList.map(file => (
                <div key={file} className="group flex items-center gap-1 pr-2 rounded-lg hover:bg-base-200 transition-colors">
                  <button
                    onClick={() => selectFile(file)}
                    className={`flex-1 text-left px-3 py-2 text-sm flex items-center gap-2 truncate ${currentFile === file ? 'text-primary font-medium' : 'text-base-content/70'}`}
                  >
                    <File size={14} />
                    <span className="truncate">{file}</span>
                  </button>
                  <button 
                    onClick={() => handleRenameFile(file)}
                    className="btn btn-ghost btn-xs btn-square opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Rename"
                  >
                    <Edit2 size={12} />
                  </button>
                </div>
              ))}
              {fileList.length === 0 && (
                <div className="text-center p-4 text-base-content/40 text-sm">No markdown files found</div>
              )}
            </div>
          </aside>
        )}

        {/* Main Task View */}
        <main className="flex-1 overflow-hidden w-full relative p-0 sm:p-4 bg-base-200/50">
          <div className="h-full max-w-5xl mx-auto flex flex-col bg-base-100 sm:rounded-xl sm:shadow-sm sm:border border-base-300 overflow-hidden">
            
            {/* Header & Controls */}
            <div className="flex justify-between items-center p-4 border-b border-base-200 bg-base-50/50">
              <div className="flex items-center gap-3 overflow-hidden">
                <h1 className="text-xl font-bold text-base-content truncate">
                  {isFolderMode ? currentFile : 'My Tasks'}
                </h1>
                <button
                  onClick={() => {
                    updateMarkdown(markdown + '\n\n# New Section\n');
                  }}
                  className="btn btn-ghost btn-xs btn-circle text-base-content/40 hover:text-primary tooltip tooltip-right"
                  data-tip="Add Section"
                >
                  <Heading size={16} />
                </button>
              </div>
              <button 
                onClick={() => setShowCompleted(!showCompleted)}
                className="btn btn-xs btn-ghost gap-1.5 text-base-content/60 hover:text-primary font-normal flex-shrink-0"
              >
                {showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}
                {showCompleted ? 'Hide Done' : 'Show Done'}
              </button>
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
                  {tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-base-content/40">
                      {isFolderMode && fileList.length === 0 ? (
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
                        </>
                      )}
                    </div>
                  ) : (
                    <DndContext 
                      sensors={sensors}
                      collisionDetection={closestCenter}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                    >
                      <SortableContext 
                        items={tasks.map(t => t.id)}
                        strategy={verticalListSortingStrategy}
                      >
                        <div className="flex flex-col divide-y divide-base-200 pb-20">
                          {tasks.map(task => (
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
                            />
                          ))}
                        </div>
                      </SortableContext>
                      <DragOverlay>
                        {activeId ? (
                          <div className="p-4 bg-base-100 border border-base-300 rounded shadow-lg opacity-90 flex items-start gap-3">
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
              
              {/* Storage Section */}
              <div>
                <h4 className="text-sm font-semibold text-base-content/70 uppercase tracking-wider mb-3">Storage Location</h4>
                <div className="flex flex-col gap-2">
                  <button 
                    onClick={() => handleStorageChange('local')} 
                    className={`btn btn-sm justify-start ${activeStorage === 'local' ? 'btn-active btn-primary' : 'btn-ghost'}`}
                  >
                    <HardDrive size={16} /> Browser Storage
                  </button>
                  <button 
                    onClick={() => handleStorageChange('fs')} 
                    className={`btn btn-sm justify-start ${activeStorage === 'fs' ? 'btn-active btn-primary' : 'btn-ghost'}`}
                  >
                    <FolderOpen size={16} /> Local Folder
                  </button>
                  <button 
                    onClick={() => handleStorageChange('cloud')} 
                    className={`btn btn-sm justify-start ${activeStorage === 'cloud' ? 'btn-active btn-primary' : 'btn-ghost'}`}
                  >
                    <Cloud size={16} /> Cloud (Mock)
                  </button>
                </div>
              </div>

              <div className="divider my-2"></div>

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
                    <div key={p.name} className="flex items-center justify-between p-3 bg-base-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full ${p.enabled ? 'bg-success' : 'bg-base-content/20'}`}></div>
                        <span className={p.enabled ? 'font-medium' : 'text-base-content/50'}>{p.name}</span>
                        {p.isSystem && <span className="badge badge-xs badge-ghost">System</span>}
                      </div>
                      <div className="flex items-center gap-2">
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
            
            <div className="modal-action">
              <button onClick={() => setShowSettings(false)} className="btn">Close</button>
            </div>
          </div>
          <form method="dialog" className="modal-backdrop">
            <button onClick={() => setShowSettings(false)}>close</button>
          </form>
        </dialog>
      )}
    </div>
  );
}

export default App;
