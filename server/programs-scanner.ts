import './block-model-root-writes';

import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import {
  getM1SinCaptureStatus,
  M1_SIN_CAPTURE_BUILD,
  scanM1SinCaptures,
  startM1SinCaptureWatcher,
} from './m1-sin-capture';
import {
  listSintralDados,
  SINTRAL_CAPTURE_BUILD,
} from './sintral-capture';
import { readSinYarnsForModel } from './sin-yarn';
import { resolveMachineForModel } from './sin-machine';
import {
  getSintralScreenStatus,
  readControleSintralForPart,
  readSintralTimesForModel,
  scanSintralScreen,
  startSintralScreenWatcher,
} from './sintral-screen';
import { readM1TimeForPart, readM1TimesForModel } from './stoll-time';
import { pushCadastroToSyntech, testSyntechConnection } from './syntech-push';
import {
  readSyntechYarnCatalog,
  syncSyntechYarnCatalogFromDb,
} from './syntech-yarn-catalog';

const PORT = 3848;
const PROGRAMS_ROOT = process.env.PROGRAMS_ROOT ?? 'C:\\Users\\Tricot&Cia\\Desktop\\PROGRAMAS';
const STOLL_TMP = process.env.STOLL_TMP ?? 'C:\\Stoll\\Tmp';
const SEARCH_DAYS = Number(process.env.PROGRAMS_SEARCH_DAYS ?? 15);

function folderMatchesRef(folderName: string, ref: string) {
  const normalized = folderName.trim();
  return normalized === ref || normalized.startsWith(`${ref}-`);
}

function parseModelName(folderName: string, ref: string) {
  if (folderName === ref) return ref;
  if (folderName.startsWith(`${ref}-`)) return folderName.slice(ref.length + 1);
  return folderName;
}

function latestMtimeInDir(dirPath: string): number {
  let latest = 0;
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return 0;
  }

  const dirStat = fs.statSync(dirPath);
  latest = Math.max(latest, dirStat.mtimeMs);

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    try {
      if (entry.isFile()) {
        latest = Math.max(latest, fs.statSync(full).mtimeMs);
      } else if (entry.isDirectory()) {
        latest = Math.max(latest, latestMtimeInDir(full));
      }
    } catch {
      // ignore unreadable entries
    }
  }
  return latest;
}

function formatDateOnly(ms: number) {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

type MatchRow = {
  reference: string;
  name: string;
  date: string;
  folder_path: string;
  latest_ms: number;
};

function findProgram(reference: string, fullSearch: boolean): MatchRow | null {
  const ref = reference.trim();
  if (!ref) return null;

  const cutoff = Date.now() - SEARCH_DAYS * 24 * 60 * 60 * 1000;
  const matches: MatchRow[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const full = path.join(dir, entry.name);

      if (folderMatchesRef(entry.name, ref)) {
        const latestMs = latestMtimeInDir(full);
        if (fullSearch || latestMs >= cutoff) {
          matches.push({
            reference: ref,
            name: parseModelName(entry.name, ref),
            date: formatDateOnly(latestMs),
            folder_path: full,
            latest_ms: latestMs,
          });
        }
      }

      walk(full);
    }
  }

  if (!fs.existsSync(PROGRAMS_ROOT)) {
    throw new Error(`Pasta de programas não encontrada: ${PROGRAMS_ROOT}`);
  }

  walk(PROGRAMS_ROOT);
  if (matches.length === 0) return null;

  matches.sort((a, b) => b.latest_ms - a.latest_ms);
  const best = matches[0];
  return {
    reference: best.reference,
    name: best.name,
    date: best.date,
    folder_path: best.folder_path,
    latest_ms: best.latest_ms,
  };
}

function stripPartSuffix(baseName: string, folderName: string, ref: string) {
  const lower = baseName.toLowerCase();
  const prefixes = [
    `${folderName.toLowerCase()}-`,
    `${ref.toLowerCase()}-`,
  ];
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      return baseName.slice(prefix.length);
    }
  }
  const modelName = parseModelName(folderName, ref);
  if (modelName !== ref && modelName !== folderName) {
    const modelPrefix = `${ref}-${modelName}-`.toLowerCase();
    if (lower.startsWith(modelPrefix)) {
      return baseName.slice(modelPrefix.length);
    }
  }
  return baseName;
}

type PartRow = {
  key: string;
  label: string;
  file_name: string;
};

function listPartsInFolder(folderPath: string, folderName: string, ref: string): PartRow[] {
  const map = new Map<string, PartRow>();

  function scan(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(full);
        continue;
      }
      if (!entry.isFile() || !/\.mdv$/i.test(entry.name)) continue;

      const label = stripPartSuffix(entry.name.replace(/\.mdv$/i, ''), folderName, ref);
      const key = label.toUpperCase();
      if (!map.has(key)) {
        map.set(key, { key, label, file_name: entry.name });
      }
    }
  }

  scan(folderPath);
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}

function findProgramFolder(reference: string, fullSearch: boolean) {
  return findProgram(reference, fullSearch);
}

function machinePayload(modelFolder: string, partRows: { file_name: string }[]) {
  const machine = resolveMachineForModel(
    modelFolder,
    partRows.map((part) => part.file_name)
  );
  if (!machine) return null;
  return {
    cms: machine.cms,
    gauge: machine.gauge,
    label: machine.label,
    syntech_maquina: machine.syntech_maquina,
  };
}

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/programs/lookup', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    const withParts = req.query.parts === '1' || req.query.parts === 'true';
    const withTimes = req.query.tempos === '1' || req.query.tempos === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgram(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias. Tente busca completa.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const payload: Record<string, unknown> = {
      reference: match.reference,
      name: match.name,
      date: match.date,
      folder_path: match.folder_path,
      searched_full: full,
      search_days: full ? null : SEARCH_DAYS,
    };

    if (withParts) {
      const partRows = listPartsInFolder(match.folder_path, folderName, ref);
      payload.parts = partRows;
      payload.machine = machinePayload(match.folder_path, partRows);
      if (withTimes) {
        const times = readSintralTimesForModel(match.folder_path, partRows);
        payload.times = {
          parts: times,
          filled: times.filter((row) => row.ok).length,
          total: times.length,
        };
      }
    }

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro na busca.' });
  }
});

app.get('/api/programs/parts', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias. Tente busca completa.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const parts = listPartsInFolder(match.folder_path, folderName, ref);

    res.json({
      reference: ref,
      name: match.name,
      folder_path: match.folder_path,
      parts,
      stoll_tmp: STOLL_TMP,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar partes.' });
  }
});

app.get('/api/programs/m1-time', (req, res) => {
  try {
    const part = String(req.query.part ?? req.query.file ?? '').trim();
    const folder = String(req.query.folder ?? '').trim();
    if (!part) {
      res.status(400).json({ error: 'Informe o arquivo da parte (.mdv).' });
      return;
    }

    const result = readM1TimeForPart(STOLL_TMP, part, folder || undefined);
    res.json(result);
  } catch (err) {
    res.status(404).json({ error: err instanceof Error ? err.message : 'Erro ao ler tempo do M1.' });
  }
});

app.get('/api/programs/m1-times', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const partRows = listPartsInFolder(match.folder_path, folderName, ref);
    const results = readM1TimesForModel(STOLL_TMP, match.folder_path, partRows);
    const filled = results.filter((r) => r.ok).length;

    res.json({
      reference: ref,
      folder_path: match.folder_path,
      parts: results,
      filled,
      total: results.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler tempos.' });
  }
});

app.get('/api/programs/sintral-yarns', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const partRows = listPartsInFolder(match.folder_path, folderName, ref);
    const yarns = readSinYarnsForModel(match.folder_path, partRows);

    res.json({
      reference: ref,
      folder_path: match.folder_path,
      parts: yarns,
      filled: yarns.filter((row) => row.ok).length,
      total: yarns.length,
      machine: machinePayload(match.folder_path, partRows),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler fios do .sin.' });
  }
});

app.get('/api/programs/sintral-times', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const partRows = listPartsInFolder(match.folder_path, folderName, ref);
    const times = readSintralTimesForModel(match.folder_path, partRows);

    res.json({
      reference: ref,
      folder_path: match.folder_path,
      parts: times,
      filled: times.filter((row) => row.ok).length,
      total: times.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler tempos do Sintral.' });
  }
});

app.get('/api/programs/sintral-dados', async (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    scanM1SinCaptures(STOLL_TMP, PROGRAMS_ROOT);
    await scanSintralScreen(PROGRAMS_ROOT);

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${PROGRAMS_ROOT}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    res.json({
      reference: ref,
      folder_path: match.folder_path,
      ...listSintralDados(match.folder_path),
      m1_sin: getM1SinCaptureStatus(),
      screen: getSintralScreenStatus(),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler dados do Sintral.' });
  }
});

app.get('/api/programs/syntech-fios', (_req, res) => {
  try {
    const catalog = readSyntechYarnCatalog();
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler catálogo de fios.' });
  }
});

app.post('/api/programs/syntech-fios/sync', async (_req, res) => {
  try {
    const catalog = await syncSyntechYarnCatalogFromDb();
    res.json(catalog);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao sincronizar fios do Syntech.' });
  }
});

app.post('/api/programs/syntech-push', async (req, res) => {
  try {
    const reference = String(req.body?.reference ?? '').trim();
    const parts = Array.isArray(req.body?.parts) ? req.body.parts : [];
    const consolidated_yarns = Array.isArray(req.body?.consolidated_yarns)
      ? req.body.consolidated_yarns
      : [];
    const full = req.body?.full_search === true || req.body?.full === true;
    let model_folder = String(req.body?.model_folder ?? '').trim();

    if (!reference) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    if (!model_folder) {
      const match = findProgram(reference, full);
      if (match) model_folder = match.folder_path;
    }

    const result = await pushCadastroToSyntech({
      reference,
      parts,
      consolidated_yarns,
      model_folder: model_folder || undefined,
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao enviar ao Syntech.' });
  }
});

app.get('/api/programs/syntech-test', async (_req, res) => {
  try {
    const ok = await testSyntechConnection();
    res.json({ ok });
  } catch (err) {
    res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Firebird indisponível.',
    });
  }
});

app.get('/api/programs/health', (_req, res) => {
  res.json({
    ok: true,
    version: 22,
    sintral_capture: SINTRAL_CAPTURE_BUILD,
    m1_sin_capture: M1_SIN_CAPTURE_BUILD,
    root: PROGRAMS_ROOT,
    stoll_tmp: STOLL_TMP,
    search_days: SEARCH_DAYS,
    features: [
      'lookup',
      'parts',
      'm1-time',
      'm1-times',
      'm1-sin-capture',
      'm1-simx-yarn',
      'sintral-screen',
      'sintral-times',
      'sintral-yarns',
      'syntech-push',
      'syntech-fios',
    ],
  });
});

app.listen(PORT, '127.0.0.1', () => {
  startM1SinCaptureWatcher(STOLL_TMP, PROGRAMS_ROOT);
  startSintralScreenWatcher(PROGRAMS_ROOT);
  console.log(`Scanner de programas em http://127.0.0.1:${PORT} (${SEARCH_DAYS} dias)`);
  console.log(`${M1_SIN_CAPTURE_BUILD}: M1 processa → .sin + .simx em dados do programa/{{parte}}/`);
  console.log('Sintral tela: cheque aberto → controle-sintral.json + .txt em dados do programa/{parte}/');
});
