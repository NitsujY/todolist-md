import type { ReactNode } from 'react';
import type { Task } from '../lib/MarkdownParser';

export interface Plugin {
  name: string;
  onInit?: (api: PluginAPI) => void;
  onTaskRender?: (task: Task) => ReactNode; // Returns extra UI to render next to task
  transformMarkdown?: (markdown: string) => string;
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
    
    this.plugins.set(plugin.name, {
      name: plugin.name,
      enabled: true,
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
    console.log(`[PluginRegistry] Plugin registered: ${plugin.name}`);
  }

  togglePlugin(name: string) {
    const meta = this.plugins.get(name);
    if (meta && !meta.isSystem) {
      meta.enabled = !meta.enabled;
      // Force re-render in React by returning a new Map or triggering a listener (simplified here)
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
  renderTaskExtensions(task: Task): ReactNode[] {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled)
      .map(meta => meta.instance.onTaskRender ? meta.instance.onTaskRender(task) : null)
      .filter(Boolean);
  }

  runMarkdownTransformers(markdown: string): string {
    return Array.from(this.plugins.values())
      .filter(meta => meta.enabled)
      .reduce((md, meta) => {
        return meta.instance.transformMarkdown ? meta.instance.transformMarkdown(md) : md;
      }, markdown);
  }
}

export const pluginRegistry = new PluginRegistry();
