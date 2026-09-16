import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createSyntechProduto,
  listSyntechDesenvPendentes,
  listSyntechProdutoOpcoes,
  lookupSyntechProduto,
} from '../server/syntech-desenv.ts';
import {
  createSyntechProdutoCadastro,
  getSyntechProdutoCadastro,
  listSyntechProdutoCadastroOpcoes,
  saveSyntechProdutoCadastro,
} from '../server/syntech-produto-cadastro.ts';
import { publishSyntechCatalog } from '../server/syntech-catalog-publish.ts';

const PORT = Number(process.env.DESENV_PORT ?? 3851);
const SYNTECH_OFF =
  'Não deu para falar com o Syntech neste PC. Precisa estar na rede da fábrica.';

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

function syntechError(err: unknown) {
  return err instanceof Error ? err.message : SYNTECH_OFF;
}

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.get('/firebase-config.js', serveFirebaseConfig);
app.get('/api/programs/desenv-pendentes', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json({ itens: await listSyntechDesenvPendentes(q) });
  } catch (err) {
    res.status(503).json({ error: syntechError(err) });
  }
});
app.get('/api/programs/desenv-produto', async (req, res) => {
  try {
    const codigo = typeof req.query.codigo === 'string' ? req.query.codigo : '';
    res.json(await lookupSyntechProduto(codigo));
  } catch (err) {
    res.status(503).json({ existe: false, error: syntechError(err) });
  }
});
app.get('/api/programs/desenv-produto-opcoes', async (_req, res) => {
  try {
    res.json(await listSyntechProdutoOpcoes());
  } catch (err) {
    res.status(503).json({ error: syntechError(err) });
  }
});
app.post('/api/programs/desenv-cadastrar-produto', async (req, res) => {
  try {
    const result = await createSyntechProduto({
      codigo: String(req.body?.codigo ?? ''),
      nome: String(req.body?.nome ?? ''),
      classificacao: Number(req.body?.classificacao),
      grupo: Number(req.body?.grupo),
      fornecedor: Number(req.body?.fornecedor),
      funcionario: Number(req.body?.funcionario),
      ncm: String(req.body?.ncm ?? ''),
    });
    void publishSyntechCatalog().catch((err) => {
      console.warn(
        'Cadastro Syntech na nuvem falhou após produto novo:',
        err instanceof Error ? err.message : err
      );
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: syntechError(err) });
  }
});
app.get('/api/programs/syntech-produto-opcoes', async (_req, res) => {
  try {
    res.json(await listSyntechProdutoCadastroOpcoes());
  } catch (err) {
    res.status(503).json({ error: syntechError(err) });
  }
});
app.get('/api/programs/syntech-produto/:codigo', async (req, res) => {
  try {
    res.json(await getSyntechProdutoCadastro(String(req.params.codigo ?? '')));
  } catch (err) {
    res.status(404).json({ error: syntechError(err) });
  }
});
app.put('/api/programs/syntech-produto/:codigo', async (req, res) => {
  try {
    res.json(
      await saveSyntechProdutoCadastro({
        ...(req.body ?? {}),
        codigo: String(req.params.codigo ?? req.body?.codigo ?? ''),
      } as import('../shared/syntech-produto-cadastro.ts').SyntechProdutoCadastro)
    );
  } catch (err) {
    res.status(400).json({ error: syntechError(err) });
  }
});
app.post('/api/programs/syntech-produto', async (req, res) => {
  try {
    res.json(await createSyntechProdutoCadastro((req.body ?? {}) as import('../shared/syntech-produto-cadastro.ts').SyntechProdutoCadastro));
  } catch (err) {
    res.status(400).json({ error: syntechError(err) });
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
