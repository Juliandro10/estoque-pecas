import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@syntech-catalog': path.resolve(rootDir, 'data/syntech-fios.json'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3847,
    proxy: {
      '/api/programs': { target: 'http://127.0.0.1:3848', changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 3847,
  },
});