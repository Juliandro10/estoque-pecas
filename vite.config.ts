import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
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