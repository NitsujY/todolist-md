import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['logo.svg', 'logo.png'],
      manifest: {
        name: 'TodoList MD',
        short_name: 'TodoList',
        description: 'A Markdown-based Todo List Application',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  base: '/',
  server: {
    host: true,
  },
  build: {
    // Use esbuild for CSS minification to avoid LightningCSS warnings
    // about newer at-rules like @property/@theme/@plugin.
    cssMinify: 'esbuild',
  },
  define: {
    '__APP_VERSION__': JSON.stringify(pkg.version),
  }
})
