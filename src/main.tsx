import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginRegistry } from './plugins/pluginEngine';
import { ThemePlugin } from './plugins/ThemePlugin';
import { FontPlugin } from './plugins/FontPlugin';
import { DueDatePlugin } from './plugins/DueDatePlugin';
import { FocusModePlugin } from './plugins/FocusModePlugin';
import { AutoCleanupPlugin } from './plugins/AutoCleanupPlugin';
import { SoundEffectsPlugin } from './plugins/SoundEffectsPlugin';
import { AutoRefreshPlugin } from './plugins/AutoRefreshPlugin';
import { AIAssistantPlugin } from './plugins/ai-assistant/AIAssistantPlugin';

// Register core plugins
pluginRegistry.register(new ThemePlugin(), true);
pluginRegistry.register(new FontPlugin(), true);
pluginRegistry.register(new DueDatePlugin());
pluginRegistry.register(new FocusModePlugin());
pluginRegistry.register(new AutoCleanupPlugin());
pluginRegistry.register(new SoundEffectsPlugin());
pluginRegistry.register(new AutoRefreshPlugin());
pluginRegistry.register(AIAssistantPlugin);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
