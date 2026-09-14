import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.DESENV_PORT ?? 3851);

function loadDotEnv(root: string) {
  try {
    const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
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
    // .env opcional
  }
}

function resolveRoot() {
  if (process.env.DESENV_ROOT) return process.env.DESENV_ROOT;
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (fs.existsSync(path.join(here, 'public', 'index.html'))) return here;
  return here;
}

const ROOT = resolveRoot();
loadDotEnv(path.resolve(ROOT, '..'));
loadDotEnv(ROOT);
const PUBLIC = path.join(ROOT, 'public');

function firebaseConfigFromEnv() {
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'controle-tricot-e-cia';
  const apiKey = process.env.VITE_FIREBASE_API_KEY ?? '';
  const authDomain =
    process.env.VITE_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`;
  return `window.DESENV_FIREBASE = ${JSON.stringify({ projectId, apiKey, authDomain })};\n`;
}

function serveFirebaseConfig(_req: express.Request, res: express.Response) {
  if (process.env.VITE_FIREBASE_API_KEY) {
    res.type('application/javascript').send(firebaseConfigFromEnv());
    return;
  }
  const baked = path.join(PUBLIC, 'firebase-config.js');
  if (fs.existsSync(baked)) {
    res.type('application/javascript').send(fs.readFileSync(baked, 'utf8'));
    return;
  }
  res.type('application/javascript').send(firebaseConfigFromEnv());
}

const SCANNER = process.env.SCANNER_URL ?? 'http://127.0.0.1:3848';

const app = express();
app.use(cors());
app.get('/firebase-config.js', serveFirebaseConfig);
app.get('/api/programs/desenv-pendentes', async (req, res) => {
  try {
    const q = new URLSearchParams();
    if (typeof req.query.q === 'string' && req.query.q.trim()) q.set('q', req.query.q.trim());
    const url = `${SCANNER}/api/programs/desenv-pendentes${q.size ? `?${q}` : ''}`;
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type('application/json').send(body);
  } catch {
    res.status(503).json({
      error: 'Syntech só neste PC da programação, com o Iniciar.bat ligado.',
    });
  }
});
app.get('/api/programs/desenv-produto', async (req, res) => {
  try {
    const q = new URLSearchParams();
    if (typeof req.query.codigo === 'string' && req.query.codigo.trim()) {
      q.set('codigo', req.query.codigo.trim());
    }
    const url = `${SCANNER}/api/programs/desenv-produto${q.size ? `?${q}` : ''}`;
    const r = await fetch(url);
    const body = await r.text();
    res.status(r.status).type('application/json').send(body);
  } catch {
    res.status(503).json({ existe: false, error: 'Syntech só neste PC da programação, com o Iniciar.bat ligado.' });
  }
});
app.use(express.static(PUBLIC));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'painel-desenvolvimentos', port: PORT });
});

function lanAddresses() {
  const found: string[] = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const info of list ?? []) {
      if (info.family === 'IPv4' && !info.internal) found.push(info.address);
    }
  }
  return found;
}

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Desenvolvimentos em http://127.0.0.1:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`Outros PCs:            http://${ip}:${PORT}`);
  }
});
server.on('error', (err) => {
  console.error('Nao abriu a porta', PORT, err instanceof Error ? err.message : err);
  process.exit(1);
});
