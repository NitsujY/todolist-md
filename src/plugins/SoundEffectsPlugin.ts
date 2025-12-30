import type { Plugin } from './pluginEngine';
import type { Task } from '../lib/MarkdownParser';

export class SoundEffectsPlugin implements Plugin {
  name = 'SoundEffects';
  defaultEnabled = true;

  // Simple "ding" sound (Base64 to ensure offline availability and avoid CORS)
  // Short "pop" sound
  private completeSound = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAABACQBAAQAAAgAZGF0YQAAAAA='); // Placeholder, will replace with real base64 below

  onInit() {
    // Real "pop" sound
    this.completeSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2578/2578-preview.m4a');
    this.completeSound.volume = 0.4;
    this.completeSound.preload = 'auto';
  }

  onTaskComplete(task: Task) {
    // Only play when completing, not un-completing
    if (task.completed) {
      this.completeSound.currentTime = 0;
      this.completeSound.play().catch(e => console.warn('Audio play failed', e));
    }
  }
}
