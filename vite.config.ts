import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
