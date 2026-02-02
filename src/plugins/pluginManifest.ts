export type PluginExportKind = 'class' | 'value';

export interface PluginManifestEntry {
  /**
   * Human/debug identifier for the manifest entry.
   * Not used by PluginRegistry for persistence (that uses plugin.name).
   */
  id: string;

  /**
   * Must match a key returned by import.meta.glob in src/main.tsx.
   * Example: './plugins/ThemePlugin.ts'
   */
  module: string;

  /**
   * Named export to load from the module.
   * If omitted, loader tries `default` then falls back to the module object.
   */
  exportName?: string;

  /** Whether the export is a class requiring `new`, or already a Plugin value */
  kind: PluginExportKind;

  /** Register as system plugin (cannot be toggled/uninstalled in UI) */
  isSystem?: boolean;

  /** Optionally override plugin.defaultEnabled at runtime */
  defaultEnabled?: boolean;

  /**
   * Optional gate. If env var equals this string, the plugin will NOT be loaded.
   * Example: { env: 'VITE_ENABLE_GAMIFY', equals: 'false' }
   */
  disableWhenEnvEquals?: { env: string; equals: string };
}

/**
 * Built-in plugins are registered from this manifest.
 * Add new plugins here without touching App/TaskItem UI code.
 */
export const pluginManifest: PluginManifestEntry[] = [
  {
    id: 'theme',
    module: './plugins/ThemePlugin.ts',
    exportName: 'ThemePlugin',
    kind: 'class',
    isSystem: true,
  },
  {
    id: 'font',
    module: './plugins/FontPlugin.ts',
    exportName: 'FontPlugin',
    kind: 'class',
    isSystem: true,
  },
  {
    id: 'due-date',
    module: './plugins/DueDatePlugin.tsx',
    exportName: 'DueDatePlugin',
    kind: 'class',
  },
  {
    id: 'focus-mode',
    module: './plugins/FocusModePlugin.tsx',
    exportName: 'FocusModePlugin',
    kind: 'class',
  },
  {
    id: 'auto-cleanup',
    module: './plugins/AutoCleanupPlugin.tsx',
    exportName: 'AutoCleanupPlugin',
    kind: 'class',
  },
  {
    id: 'sound-effects',
    module: './plugins/SoundEffectsPlugin.ts',
    exportName: 'SoundEffectsPlugin',
    kind: 'class',
  },
  {
    id: 'auto-refresh',
    module: './plugins/AutoRefreshPlugin.tsx',
    exportName: 'AutoRefreshPlugin',
    kind: 'class',
  },
  {
    id: 'reminders-link',
    module: './plugins/RemindersLinkPlugin.tsx',
    exportName: 'RemindersLinkPlugin',
    kind: 'class',
    defaultEnabled: false,
  },
  {
    id: 'file-change-detection',
    module: './plugins/FileChangeDetectionPlugin.tsx',
    exportName: 'FileChangeDetectionPlugin',
    kind: 'class',
    defaultEnabled: true,
  },
  {
    id: 'bot',
    module: './plugins/bot-plugin/BotPlugin.tsx',
    exportName: 'BotPlugin',
    kind: 'class',
    defaultEnabled: true,
  },
  // {
  //   id: 'gamify',
  //   module: './plugins/gamify-plugin/GamifyPlugin.tsx',
  //   exportName: 'GamifyPlugin',
  //   kind: 'class',
  //   disableWhenEnvEquals: { env: 'VITE_ENABLE_GAMIFY', equals: 'false' },
  // },
];
