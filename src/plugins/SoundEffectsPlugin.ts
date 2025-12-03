import type { Plugin, PluginAPI } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';

export class SoundEffectsPlugin implements Plugin {
  name = 'SoundEffects';
  defaultEnabled = false;

  // Simple "ding" sound
  private completeSound = new Audio('https://codeskulptor-demos.commondatastorage.googleapis.com/GalaxyInvaders/bonus.wav');

  onInit(_api: PluginAPI) {
    this.completeSound.volume = 0.3;
  }

  onTaskComplete(task: Task) {
    // Only play when completing, not un-completing
    if (task.completed) {
      this.completeSound.currentTime = 0;
      this.completeSound.play().catch(e => console.warn('Audio play failed', e));
    }
  }
}
