import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const BOARD = 'quadro-board';
const boardSrc = path.resolve(rootDir, 'painel-tecelagem/public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function tecelagemBoardPlugin(): Plugin {
  const prefix = `/${BOARD}`;
  const sendBoard = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith(prefix)) {
      next();
      return;
    }
    const rel =
      url === prefix || url === `${prefix}/` ? 'index.html' : decodeURIComponent(url.slice(prefix.length + 1));
    const file = path.normalize(path.join(boardSrc, rel));
    if (!file.startsWith(boardSrc) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      next();
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: 'tecelagem-board',
    configureServer(server) {
      server.middlewares.use(sendBoard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sendBoard);
    },
    closeBundle() {
      const dest = path.join(rootDir, 'dist', BOARD);
      fs.cpSync(boardSrc, dest, { recursive: true });
    },
  };
}

export default defineConfig({
  plugins: [react(), tecelagemBoardPlugin()],
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
      '/api/quadro': { target: 'http://127.0.0.1:3848', changeOrigin: true },
      '/api/paradas': { target: 'http://127.0.0.1:3848', changeOrigin: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 3847,
  },
});