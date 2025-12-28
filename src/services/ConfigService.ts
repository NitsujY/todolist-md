import type { StorageProvider } from '../adapters/StorageProvider';

export interface AppConfig {
  ui?: {
    theme?: 'light' | 'dark' | 'auto';
    fontSize?: 'small' | 'normal' | 'large' | 'xl';
    compactMode?: boolean;
    sidebarCollapsed?: boolean;
    enabledPlugins?: Record<string, boolean>;
  };
  plugins?: Record<string, any>;
}

const CONFIG_FILENAME = '.todolist-md.config.json';

export class ConfigService {
  private storage: StorageProvider;
  private cachedConfig: AppConfig | null = null;

  constructor(storage: StorageProvider) {
    this.storage = storage;
  }

  async load(): Promise<AppConfig> {
    try {
      const content = await this.storage.read(CONFIG_FILENAME);
      if (content) {
        this.cachedConfig = JSON.parse(content);
      } else {
        this.cachedConfig = {};
      }
    } catch (e) {
      console.error('Failed to load config', e);
      this.cachedConfig = {};
    }
    return this.cachedConfig!;
  }

  get(): AppConfig {
    return this.cachedConfig || {};
  }

  async update(updates: Partial<AppConfig> | ((current: AppConfig) => Partial<AppConfig>)) {
    // 1. Read latest from storage (Read-Modify-Write pattern)
    let current: AppConfig = {};
    try {
      const content = await this.storage.read(CONFIG_FILENAME);
      if (content) {
        current = JSON.parse(content);
      }
    } catch {
      // Ignore missing file
    }

    // 2. Apply updates
    const changes = typeof updates === 'function' ? updates(current) : updates;
    
    // Deep merge for top-level sections (ui, plugins)
    const newConfig: AppConfig = {
      ...current,
      ...changes,
      ui: { ...current.ui, ...changes.ui },
      plugins: { ...current.plugins, ...changes.plugins },
    };

    // 3. Write back
    try {
      await this.storage.write(CONFIG_FILENAME, JSON.stringify(newConfig, null, 2));
      this.cachedConfig = newConfig;
    } catch (e) {
      console.error('Failed to save config', e);
      throw e;
    }
  }

  async migrateFromLocalStorage() {
    if (!this.cachedConfig) await this.load();
    
    const updates: any = { ui: {} };
    let hasUpdates = false;

    // Theme
    const theme = localStorage.getItem('theme');
    if (theme && !this.cachedConfig?.ui?.theme) {
      updates.ui.theme = theme;
      hasUpdates = true;
    }

    // Sidebar
    const sidebar = localStorage.getItem('sidebar-collapsed');
    if (sidebar !== null && this.cachedConfig?.ui?.sidebarCollapsed === undefined) {
      updates.ui.sidebarCollapsed = JSON.parse(sidebar);
      hasUpdates = true;
    }

    // Plugins
    const enabledPlugins: Record<string, boolean> = {};
    let hasPluginUpdates = false;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('plugin-enabled-')) {
        const pluginName = key.replace('plugin-enabled-', '');
        const enabled = JSON.parse(localStorage.getItem(key)!);
        if (this.cachedConfig?.ui?.enabledPlugins?.[pluginName] === undefined) {
           enabledPlugins[pluginName] = enabled;
           hasPluginUpdates = true;
        }
      }
    }

    if (hasPluginUpdates) {
      updates.ui.enabledPlugins = { ...(this.cachedConfig?.ui?.enabledPlugins || {}), ...enabledPlugins };
      hasUpdates = true;
    }

    if (hasUpdates) {
      console.log('Migrating local settings to config file...', updates);
      await this.update(c => ({
        ...c,
        ui: {
          ...c.ui,
          ...updates.ui,
          enabledPlugins: {
            ...(c.ui?.enabledPlugins || {}),
            ...(updates.ui.enabledPlugins || {})
          }
        }
      }));
    }
  }
}
