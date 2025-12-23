import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginRegistry } from './plugins/pluginEngine';
import { pluginManifest } from './plugins/pluginManifest';

async function registerPluginsFromManifest() {
  // Only include plugin entry modules referenced by pluginManifest.
  // This avoids bundling unrelated internal files under src/plugins/.
  const modules = import.meta.glob('./plugins/**/*Plugin.{ts,tsx}');

  for (const entry of pluginManifest) {
    const gate = entry.disableWhenEnvEquals;
    if (gate) {
      const envVal = (import.meta as any).env?.[gate.env];
      if (String(envVal) === gate.equals) {
        continue;
      }
    }

    const importer = modules[entry.module];
    if (!importer) {
      console.warn(`[PluginManifest] Module not found in glob: ${entry.module}`);
      continue;
    }

    try {
      const mod: any = await importer();
      const exported = entry.exportName ? mod?.[entry.exportName] : (mod?.default ?? mod);
      if (!exported) {
        console.warn(`[PluginManifest] Export not found: ${entry.exportName ?? 'default'} from ${entry.module}`);
        continue;
      }

      const pluginInstance = entry.kind === 'class' ? new exported() : exported;
      if (entry.defaultEnabled !== undefined) {
        (pluginInstance as any).defaultEnabled = entry.defaultEnabled;
      }
      pluginRegistry.register(pluginInstance, entry.isSystem ?? false);
    } catch (err) {
      console.error(`[PluginManifest] Failed to load plugin ${entry.id} (${entry.module})`, err);
    }
  }
}

async function bootstrap() {
  await registerPluginsFromManifest();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}

void bootstrap();
