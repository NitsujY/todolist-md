import type { ReactNode } from 'react';
import type { Task } from '../lib/MarkdownParser';

export interface Plugin {
  name: string;
  onInit?: (api: PluginAPI) => void;
  onTaskRender?: (task: Task, context?: { isEditing: boolean; onExit?: () => void }) => ReactNode; // Returns extra UI to render next to task
  transformMarkdown?: (markdown: string) => string;
  onTaskComplete?: (task: Task) => void;
  renderDashboard?: () => ReactNode;
  renderHeaderButton?: () => ReactNode;
  renderSettings?: () => ReactNode;
  onEnable?: () => void;
  onDisable?: () => void;
  defaultEnabled?: boolean;
}

export interface PluginMetadata {
  name: string;
  enabled: boolean;
  isSystem: boolean;
  instance: Plugin;
}

export interface PluginAPI {
  registerAction: (name: string, action: () => void) => void;
}

class PluginRegistry {
  private plugins: Map<string, PluginMetadata> = new Map();
  public actions: Map<string, () => void> = new Map();

  register(plugin: Plugin, isSystem: boolean = false) {
    if (this.plugins.has(plugin.name)) {
      console.warn(`[PluginRegistry] Plugin already registered: ${plugin.name}`);
      return;
    }
    
    // Load persisted state
    const savedState = localStorage.getItem(`plugin-enabled-${plugin.name}`);
    const isEnabled = savedState !== null 
      ? JSON.parse(savedState) 
      : (plugin.defaultEnabled ?? true);

    this.plugins.set(plugin.name, {
      name: plugin.name,
      enabled: isEnabled,
      isSystem,
      instance: plugin
    });

    if (plugin.onInit) {
      plugin.onInit({
        registerAction: (name, action) => {
          this.actions.set(name, action);
          console.log(`[PluginRegistry] Action registered: ${name}`);
        }
      });
    }
    
    // If plugin is enabled by default (or system), trigger onEnable
    if (this.plugins.get(plugin.name)?.enabled && plugin.onEnable) {
      plugin.onEnable();
    }

    console.log(`[PluginRegistry] Plugin registered: ${plugin.name}`);
  }

  togglePlugin(name: string) {
    const meta = this.plugins.get(name);
    if (meta && !meta.isSystem) {
      meta.enabled = !meta.enabled;
      localStorage.setItem(`plugin-enabled-${name}`, JSON.stringify(meta.enabled));
      
      if (meta.enabled && meta.instance.onEnable) {
        meta.instance.onEnable();
      } else if (!meta.enabled && meta.instance.onDisable) {
        meta.instance.onDisable();
      }
    }
  }

  unregister(name: string) {
    const meta = this.plugins.get(name);
    if (meta && !meta.isSystem) {
      this.plugins.delete(name);
      console.log(`[PluginRegistry] Plugin unregistered: ${name}`);
    }
  }

  getPlugins(): PluginMetadata[] {
    return Array.from(this.plugins.values());
  }

  // Hook execution helpers
  renderTaskExtensions(task: Task, context?: { isEditing: boolean }): ReactNode[] {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled)
      .map(meta => meta.instance.onTaskRender ? meta.instance.onTaskRender(task, context) : null)
      .filter(Boolean);
  }

  renderHeaderButtons(): ReactNode[] {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled)
      .map(meta => meta.instance.renderHeaderButton ? meta.instance.renderHeaderButton() : null)
      .filter(Boolean);
  }

  runMarkdownTransformers(markdown: string): string {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled)
      .reduce((md, meta) => {
        return meta.instance.transformMarkdown ? meta.instance.transformMarkdown(md) : md;
      }, markdown);
  }

  notifyTaskComplete(task: Task) {
    this.plugins.forEach(meta => {
      if (meta.enabled && meta.instance.onTaskComplete) {
        meta.instance.onTaskComplete(task);
      }
    });
  }

  getDashboards(): ReactNode[] {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled && meta.instance.renderDashboard)
      .map(meta => meta.instance.renderDashboard!());
  }
}

export const pluginRegistry = new PluginRegistry();
