import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readSyntechProducaoBoardCached } from '../server/syntech-producao.ts';
import {
  abrirSyntechParada,
  encerrarSyntechParada,
  listSyntechMotivosParada,
} from '../server/syntech-paradas.ts';
import { startSyntechDesenvBridge } from '../server/syntech-desenv-bridge.ts';
import { toPainelPublico } from './public-board.ts';
import { publishPainelToFirebase } from './publish-firebase.ts';

const PORT = Number(process.env.PAINEL_PORT ?? 3850);

function resolveRoot() {
  if (process.env.PAINEL_ROOT) return process.env.PAINEL_ROOT;
  const here = path.dirname(fileURLToPath(import.meta.url));
  if (fs.existsSync(path.join(here, 'public', 'index.html'))) return here;
  return here;
}

const ROOT = resolveRoot();
const PUBLIC = path.join(ROOT, 'public');
console.log(`Pasta do painel: ${ROOT}`);
if (!fs.existsSync(path.join(PUBLIC, 'index.html'))) {
  console.error(`Nao achei public/index.html em ${PUBLIC}`);
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(PUBLIC));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'painel-tecelagem', port: PORT });
});

app.get('/api/quadro', async (_req, res) => {
  try {
    const board = await readSyntechProducaoBoardCached();
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

app.get('/api/paradas/motivos', async (_req, res) => {
  try {
    res.json({ motivos: await listSyntechMotivosParada() });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao ler os motivos de parada.',
    });
  }
});

app.post('/api/paradas/abrir', async (req, res) => {
  try {
    const result = await abrirSyntechParada({
      maquina: Number(req.body?.maquina),
      tipo: Number(req.body?.tipo),
      codigo: Number(req.body?.codigo),
      cracha: String(req.body?.cracha ?? ''),
      obs: String(req.body?.obs ?? ''),
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Não deu para abrir a parada.',
    });
  }
});

app.post('/api/paradas/encerrar', async (req, res) => {
  try {
    const result = await encerrarSyntechParada({
      maquina: Number(req.body?.maquina),
      cracha: String(req.body?.cracha ?? ''),
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Não deu para encerrar a parada.',
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

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Painel Tecelagem em http://127.0.0.1:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`Outros PCs / TV:     http://${ip}:${PORT}`);
  }
  setTimeout(() => {
    void publishTick();
    setInterval(() => void publishTick(), 60_000);
    startSyntechDesenvBridge();
  }, 1500);
});
server.on('error', (err) => {
  console.error('Nao abriu a porta', PORT, err instanceof Error ? err.message : err);
  process.exit(1);
});

let publishing = false;
async function publishTick() {
  if (publishing) return;
  publishing = true;
  try {
    const board = await readSyntechProducaoBoardCached();
    await publishPainelToFirebase(toPainelPublico(board));
  } catch (err) {
    console.warn('Nuvem:', err instanceof Error ? err.message : err);
  } finally {
    publishing = false;
  }
}
