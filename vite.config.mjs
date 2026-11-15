import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = __dirname;
const UI_ROOT = path.resolve(REPO_ROOT, 'src', 'ui');
const WEB_ROOT = path.resolve(REPO_ROOT, 'web');

export default defineConfig(({ command }) => ({
  root: UI_ROOT,
  base: './',
  publicDir: command === 'serve' ? WEB_ROOT : false,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': UI_ROOT,
      '@web': WEB_ROOT,
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [REPO_ROOT],
    },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: path.resolve(WEB_ROOT, 'rework'),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(UI_ROOT, 'index.html'),
      output: {
        entryFileNames: 'assets/map-rework.js',
        chunkFileNames: 'assets/map-rework-[name].js',
        assetFileNames: (assetInfo) => {
          const name = assetInfo.names?.[0] || assetInfo.name || '';
          if (name.endsWith('.css')) return 'assets/map-rework.css';
          return 'assets/[name][extname]';
        },
      },
    },
  },
}));
