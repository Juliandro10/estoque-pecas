import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';
import { defineConfig } from 'vite';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const BOARD = 'quadro-board';
const DESENV = 'desenv-board';
const FICHA_CUSTO = 'ficha-custo';
const boardSrc = path.resolve(rootDir, 'painel-tecelagem/public');
const desenvSrc = path.resolve(rootDir, 'painel-desenvolvimentos/public');
const fichaCustoSrc = path.resolve(rootDir, 'ficha-custo/public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function loadDotEnv() {
  try {
    const raw = fs.readFileSync(path.join(rootDir, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    /* .env opcional */
  }
}

function firebaseEnv() {
  loadDotEnv();
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'controle-tricot-e-cia';
  const apiKey = process.env.VITE_FIREBASE_API_KEY ?? '';
  const authDomain =
    process.env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`;
  return { projectId, apiKey, authDomain };
}

function desenvFirebaseConfigJs() {
  return `window.DESENV_FIREBASE = ${JSON.stringify(firebaseEnv())};\n`;
}

function painelFirebaseConfigJs() {
  const { projectId, apiKey } = firebaseEnv();
  return `window.PAINEL_FIREBASE = ${JSON.stringify({ projectId, apiKey })};\n`;
}

function fichaCustoFirebaseConfigJs() {
  const { projectId, apiKey } = firebaseEnv();
  return `window.FICHA_CUSTO_FIREBASE = ${JSON.stringify({ projectId, apiKey })};\n`;
}

function staticBoardPlugin(name: string, prefix: string, src: string): Plugin {
  const sendBoard = (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const url = req.url?.split('?')[0] ?? '';
    if (!url.startsWith(prefix)) {
      next();
      return;
    }
    const rel =
      url === prefix || url === `${prefix}/` ? 'index.html' : decodeURIComponent(url.slice(prefix.length + 1));
    if (name === BOARD && rel === 'firebase-config.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(painelFirebaseConfigJs());
      return;
    }
    if (name === DESENV && rel === 'firebase-config.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(desenvFirebaseConfigJs());
      return;
    }
    if (name === FICHA_CUSTO && rel === 'firebase-config.js') {
      res.setHeader('Content-Type', 'text/javascript; charset=utf-8');
      res.end(fichaCustoFirebaseConfigJs());
      return;
    }
    const file = path.normalize(path.join(src, rel));
    if (!file.startsWith(src) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      next();
      return;
    }
    res.setHeader('Content-Type', MIME[path.extname(file)] ?? 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  };
  return {
    name: `static-board-${name}`,
    configureServer(server) {
      server.middlewares.use(sendBoard);
    },
    configurePreviewServer(server) {
      server.middlewares.use(sendBoard);
    },
    closeBundle() {
      const dest = path.join(rootDir, 'dist', name);
      fs.cpSync(src, dest, { recursive: true });
      if (name === BOARD) {
        fs.writeFileSync(path.join(dest, 'firebase-config.js'), painelFirebaseConfigJs());
      }
      if (name === DESENV) {
        fs.writeFileSync(path.join(dest, 'firebase-config.js'), desenvFirebaseConfigJs());
      }
      if (name === FICHA_CUSTO) {
        fs.writeFileSync(path.join(dest, 'firebase-config.js'), fichaCustoFirebaseConfigJs());
      }
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    staticBoardPlugin(BOARD, `/${BOARD}`, boardSrc),
    staticBoardPlugin(DESENV, `/${DESENV}`, desenvSrc),
    staticBoardPlugin(FICHA_CUSTO, `/${FICHA_CUSTO}`, fichaCustoSrc),
  ],
  resolve: {
    alias: {
      '@syntech-catalog': path.resolve(rootDir, 'data/syntech-fios.json'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 3847,
    watch: {
      ignored: [
        '**/installer/payload/**',
        '**/installer/.cache/**',
      ],
    },
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