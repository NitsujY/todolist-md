import { useEffect, useState } from 'react';
import { useTodoStore } from './store/useTodoStore';
import { pluginRegistry } from './plugins/pluginEngine';
import { Settings, FileText, Plus, Cloud, RefreshCw, ChevronDown, FolderOpen, Eye, EyeOff, Trash2, Power, Package, Save } from 'lucide-react';
import { ThemePlugin } from './plugins/ThemePlugin';
import { TaskItem } from './components/TaskItem';

function App() {
  const { 
    tasks, 
    markdown, 
    isLoading, 
    loadTodos, 
    toggleTask, 
    addTask, 
    setStorage,
    updateMarkdown 
  } = useTodoStore();

  const [newTaskText, setNewTaskText] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [activeStorage, setActiveStorage] = useState<'local' | 'cloud' | 'fs'>('local');
  const [isEditingRaw, setIsEditingRaw] = useState(false);
  const [rawMarkdown, setRawMarkdown] = useState('');
  const [showCompleted, setShowCompleted] = useState(true);
  const [, setPluginUpdate] = useState(0); // Force re-render for plugins
  const [currentTheme, setCurrentTheme] = useState<'light' | 'dark' | 'auto'>('auto');

  useEffect(() => {
    loadTodos();
    
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
  }, []);

  useEffect(() => {
    setRawMarkdown(markdown);
  }, [markdown]);

  const handleStorageChange = (type: 'local' | 'cloud' | 'fs') => {
    setActiveStorage(type);
    setStorage(type);
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  };

  const handleAddTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (newTaskText.trim()) {
      addTask(newTaskText);
      setNewTaskText('');
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

  const handleSetTheme = (theme: 'light' | 'dark' | 'auto') => {
    setCurrentTheme(theme);
    if (theme === 'light') (pluginRegistry as any).actions.get('setThemeLight')?.();
    if (theme === 'dark') (pluginRegistry as any).actions.get('setThemeDark')?.();
    if (theme === 'auto') (pluginRegistry as any).actions.get('setThemeAuto')?.();
  };

  return (
    <div className="flex flex-col h-screen bg-base-200 font-sans overflow-hidden">
      
      {/* Top Navigation Bar */}
      <div className="navbar bg-base-100 shadow-sm z-50 px-4 border-b border-base-300">
        <div className="flex-1">
          <a className="btn btn-ghost text-xl text-primary gap-2 font-bold tracking-tight">
            <FileText size={24} className="text-primary" />
            TodoMD
          </a>
        </div>
        <div className="flex-none gap-2">
          {/* Storage Selector */}
          <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-sm btn-ghost m-1 font-normal">
              {activeStorage === 'local' && <FileText size={16} />}
              {activeStorage === 'cloud' && <Cloud size={16} />}
              {activeStorage === 'fs' && <FolderOpen size={16} />}
              <span className="hidden sm:inline">
                {activeStorage === 'local' ? 'Local' : activeStorage === 'cloud' ? 'Cloud' : 'File System'}
              </span>
              <ChevronDown size={14} />
            </div>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
              <li><a onClick={() => handleStorageChange('local')} className={activeStorage === 'local' ? 'active' : ''}><FileText size={16} /> Local Storage</a></li>
              <li><a onClick={() => handleStorageChange('cloud')} className={activeStorage === 'cloud' ? 'active' : ''}><Cloud size={16} /> Mock Cloud</a></li>
              <li><a onClick={() => handleStorageChange('fs')} className={activeStorage === 'fs' ? 'active' : ''}><FolderOpen size={16} /> File System</a></li>
            </ul>
          </div>

          <div className="divider divider-horizontal mx-0 h-6 self-center"></div>

          <button onClick={() => loadTodos()} className="btn btn-ghost btn-circle btn-sm" title="Refresh">
            <RefreshCw size={18} />
          </button>

          <button 
            onClick={() => setIsEditingRaw(!isEditingRaw)}
            className={`btn btn-sm ${isEditingRaw ? 'btn-primary' : 'btn-ghost'}`}
          >
            {isEditingRaw ? 'View List' : 'Edit MD'}
          </button>

          <button onClick={() => setShowSettings(true)} className="btn btn-ghost btn-circle btn-sm" title="Settings">
            <Settings size={18} />
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden w-full relative p-4 lg:p-8">
        <div className="h-full max-w-3xl mx-auto flex flex-col">
          
          {/* Header & Controls */}
          <div className="flex justify-between items-end mb-6 px-2">
            <h1 className="text-3xl font-bold text-base-content">My Tasks</h1>
            <button 
              onClick={() => setShowCompleted(!showCompleted)}
              className="btn btn-xs btn-ghost gap-1 text-base-content/60 hover:text-primary"
            >
              {showCompleted ? <Eye size={14} /> : <EyeOff size={14} />}
              {showCompleted ? 'Hide Completed' : 'Show Completed'}
            </button>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 text-base-content/50">
              <span className="loading loading-spinner loading-lg text-primary"></span>
              <span className="mt-4">Loading tasks...</span>
            </div>
          ) : isEditingRaw ? (
            <div className="h-full flex flex-col card bg-base-100 shadow-xl overflow-hidden border border-base-300">
              <div className="card-body p-0 flex-1 flex flex-col">
                <textarea 
                  className="textarea textarea-ghost flex-1 w-full p-4 font-mono text-sm resize-none focus:outline-none"
                  value={rawMarkdown}
                  onChange={(e) => setRawMarkdown(e.target.value)}
                  spellCheck={false}
                />
                <div className="p-4 border-t border-base-200 flex justify-end bg-base-100">
                  <button onClick={handleSaveRaw} className="btn btn-primary btn-sm gap-2">
                    <Save size={16} /> Save Changes
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col h-full bg-base-100 rounded-2xl shadow-sm border border-base-300 overflow-hidden">
              {/* Task List */}
              <div className="flex-1 overflow-y-auto">
                {tasks.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-base-content/40">
                    <Package size={48} className="mb-2 opacity-20" />
                    <p>No tasks found</p>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {tasks.map(task => (
                      <TaskItem 
                        key={task.id} 
                        task={task} 
                        onToggle={toggleTask} 
                        showCompleted={showCompleted}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Add Task Input */}
              <div className="p-4 bg-base-50 border-t border-base-200">
                <form onSubmit={handleAddTask} className="flex gap-2">
                  <input 
                    type="text" 
                    value={newTaskText}
                    onChange={(e) => setNewTaskText(e.target.value)}
                    placeholder="Add a new task..."
                    className="input input-ghost w-full focus:bg-base-100 transition-colors"
                  />
                  <button type="submit" className="btn btn-circle btn-primary btn-sm">
                    <Plus size={20} />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Settings Modal */}
      {showSettings && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-md">
            <form method="dialog">
              <button onClick={() => setShowSettings(false)} className="btn btn-sm btn-circle btn-ghost absolute right-2 top-2">✕</button>
            </form>
            <h3 className="font-bold text-lg mb-6">Settings</h3>
            
            <div className="space-y-6">
              
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
