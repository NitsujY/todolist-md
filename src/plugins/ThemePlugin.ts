import type { Plugin, PluginAPI } from './pluginEngine';

type Theme = 'light' | 'dark' | 'auto';

export class ThemePlugin implements Plugin {
  name = 'ThemeManager';
  private currentTheme: Theme = 'auto';

  onInit(api: PluginAPI) {
    // Register actions to switch themes
    api.registerAction('setThemeLight', () => this.setTheme('light'));
    api.registerAction('setThemeDark', () => this.setTheme('dark'));
    api.registerAction('setThemeAuto', () => this.setTheme('auto'));

    // Initialize theme from local storage or default
    const savedTheme = localStorage.getItem('theme') as Theme;
    this.setTheme(savedTheme || 'auto');

    // Listen for system preference changes if in auto mode
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (this.currentTheme === 'auto') {
        this.applyTheme('auto');
      }
    });
  }

  private setTheme(theme: Theme) {
    this.currentTheme = theme;
    localStorage.setItem('theme', theme);
    this.applyTheme(theme);
  }

  private applyTheme(theme: Theme) {
    const isDark = 
      theme === 'dark' || 
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      document.documentElement.classList.add('dark');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.setAttribute('data-theme', 'light');
    }
  }
}
