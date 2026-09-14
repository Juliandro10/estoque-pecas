import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadDotEnv() {
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

loadDotEnv();

const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'controle-tricot-e-cia';
const apiKey = process.env.VITE_FIREBASE_API_KEY ?? '';
const dest = path.join(root, 'dist', 'tecelagem');
let previousCfg = '';
try {
  previousCfg = fs.readFileSync(path.join(dest, 'firebase-config.js'), 'utf8');
} catch {
  previousCfg = '';
}

fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });
fs.cpSync(path.join(root, 'painel-tecelagem', 'public'), dest, { recursive: true });

if (apiKey) {
  fs.writeFileSync(
    path.join(dest, 'firebase-config.js'),
    `window.PAINEL_FIREBASE = ${JSON.stringify({ projectId, apiKey })};\n`
  );
} else if (previousCfg.includes('apiKey') && !previousCfg.includes('""')) {
  fs.writeFileSync(path.join(dest, 'firebase-config.js'), previousCfg);
  console.warn('Mantive a chave da nuvem que ja estava no dist.');
} else {
  console.warn('Sem VITE_FIREBASE_API_KEY: o celular nao vai ler o quadro.');
}

console.log(`Painel copiado para ${dest}`);

const quadro = path.join(root, 'dist', 'quadro-board');
fs.rmSync(quadro, { recursive: true, force: true });
fs.cpSync(path.join(root, 'painel-tecelagem', 'public'), quadro, { recursive: true });
console.log(`Quadro do Estoque copiado para ${quadro}`);
