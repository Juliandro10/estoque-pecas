import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSyntechProducaoBoard } from '../server/syntech-producao.ts';
import { toPainelPublico } from './public-board.ts';
import { publishPainelToFirebase } from './publish-firebase.ts';

const PORT = Number(process.env.PAINEL_PORT ?? 3850);
const HOST = process.env.PAINEL_HOST ?? '0.0.0.0';

function resolveRoot() {
  if (process.env.PAINEL_ROOT) return process.env.PAINEL_ROOT;
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (fs.existsSync(path.join(here, 'public', 'index.html'))) return here;
  return here;
}

const ROOT = resolveRoot();
const PUBLIC = path.join(ROOT, 'public');

const app = express();
app.use(cors());
app.use(express.static(PUBLIC));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'painel-tecelagem', port: PORT });
});

app.get('/api/quadro', async (_req, res) => {
  try {
    const board = await readSyntechProducaoBoard();
    res.json(board);
    void publishPainelToFirebase(toPainelPublico(board)).catch((err) => {
      console.warn('Nuvem:', err instanceof Error ? err.message : err);
    });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao ler o Syntech.',
    });
  }
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

app.listen(PORT, HOST, () => {
  console.log(`Painel Tecelagem em http://127.0.0.1:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`Outros PCs / TV:     http://${ip}:${PORT}`);
  }
  console.log('Deixe esta janela aberta. Ctrl+C para parar.');
  void publishTick();
  setInterval(() => void publishTick(), 60_000);
});

let publishing = false;
async function publishTick() {
  if (publishing) return;
  publishing = true;
  try {
    const board = await readSyntechProducaoBoard();
    await publishPainelToFirebase(toPainelPublico(board));
  } catch (err) {
    console.warn('Nuvem:', err instanceof Error ? err.message : err);
  } finally {
    publishing = false;
  }
}
