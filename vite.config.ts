import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// BASE_PATH is injected by the GitHub Pages deploy workflow
// ("/" for <user>.github.io repos, "/<repo>/" for project repos).
export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        main: resolve(import.meta.dirname, 'index.html'),
        tracker: resolve(import.meta.dirname, 'tracker/index.html'),
      },
    },
  },
  server: { port: 5173 },
});
