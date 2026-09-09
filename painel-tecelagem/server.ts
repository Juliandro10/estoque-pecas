import cors from 'cors';
import express from 'express';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSyntechProducaoBoard } from '../server/syntech-producao.ts';

const PORT = Number(process.env.PAINEL_PORT ?? 3850);
const HOST = process.env.PAINEL_HOST ?? '0.0.0.0';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
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
});
