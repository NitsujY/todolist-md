import type { Plugin, PluginAPI } from './pluginEngine';

type FontType = 'inter' | 'roboto-mono' | 'fira-code' | 'system';

export class FontPlugin implements Plugin {
  name = 'FontManager';
  private currentFont: FontType = 'system';

  onInit(api: PluginAPI) {
    // Register actions to switch fonts
    api.registerAction('setFontInter', () => this.setFont('inter'));
    api.registerAction('setFontRobotoMono', () => this.setFont('roboto-mono'));
    api.registerAction('setFontFiraCode', () => this.setFont('fira-code'));
    api.registerAction('setFontSystem', () => this.setFont('system'));

    // Initialize font from local storage or default
    const savedFont = localStorage.getItem('font-preference') as FontType;
    this.setFont(savedFont || 'system');
  }

  private setFont(font: FontType) {
    this.currentFont = font;
    localStorage.setItem('font-preference', font);
    this.applyFont(font);
  }

  private applyFont(font: FontType) {
    document.documentElement.setAttribute('data-font', font);
  }
}
