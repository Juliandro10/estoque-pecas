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
import { listModelParts, type ModelPartRow } from './model-parts';
import {
  getSintralScreenStatus,
  readControleSintralForPart,
  readSintralTimesForModel,
  scanSintralScreen,
  startSintralScreenWatcher,
} from './sintral-screen';
import { readM1TimeForPart, readM1TimesForModel } from './stoll-time';
import { pushCadastroToSyntech, testSyntechConnection } from './syntech-push';
import { buildCadastroPdfBuffer, cadastroPdfFileName } from '../shared/cadastro-pdf';
import { DADOS_PROGRAMA_DIR } from './sintral-capture';
import { openLocalFile } from './open-local-file';
import {
  readSyntechYarnCatalog,
  syncSyntechYarnCatalogFromDb,
} from './syntech-yarn-catalog';
import { readSyntechProducaoBoard } from './syntech-producao';
import {
  abrirSyntechParada,
  encerrarSyntechParada,
  listSyntechMotivosParada,
} from './syntech-paradas';
import { listSyntechDesenvPendentes } from './syntech-desenv';
import { yarnTypesFromCatalog } from './syntech-yarn-types';
import {
  addM1Measurement,
  computeDensity,
  findSimilarMeasurements,
  readM1Knowledge,
} from './m1-knowledge';
import { readM1DensityForModel, readM1DensityForPart } from './m1-density-read';
import {
  resolveM1VisualFile,
  saveM1VisualBuffer,
  saveM1VisualUpload,
  stitchTypesWithVisualUrls,
  upsertM1StitchType,
} from './m1-visual';
import { knittSymForApi } from './knitt-sym';
import { m1FabricLibForApi } from './m1-fabric-lib';
import { listM1BitmapCatalog, resolveM1BitmapFile, suggestBitmapForStitchCode } from './m1-bitmap-catalog';
import { readM1MeshForModel, readM1MeshForPart } from './m1-mesh-read';
import { isIgnoredProgramSubfolder } from './program-folders';
import { handleBackupRequest, type BackupRequest } from './backup-handler';
import {
  formatProgramsRootsLabel,
  getProgramsRoots,
  requireProgramsRoots,
} from './programs-roots';

const PORT = 3848;
const STOLL_TMP = process.env.STOLL_TMP ?? 'C:\\Stoll\\Tmp';
const SEARCH_DAYS = Number(process.env.PROGRAMS_SEARCH_DAYS ?? 15);

function programsRootsLabel() {
  const roots = getProgramsRoots();
  return roots.length > 0
    ? formatProgramsRootsLabel(roots)
    : formatProgramsRootsLabel(requireProgramsRoots());
}

function scanAllProgramsRoots() {
  scanM1SinCaptures(STOLL_TMP);
}

async function scanAllSintralScreens() {
  await scanSintralScreen();
}

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
        if (isIgnoredProgramSubfolder(entry.name)) continue;
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
      if (isIgnoredProgramSubfolder(entry.name)) continue;

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

  const programsRoots = requireProgramsRoots();
  for (const programsRoot of programsRoots) {
    walk(programsRoot);
  }
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

function listPartsInFolder(folderPath: string, folderName: string, ref: string): ModelPartRow[] {
  return listModelParts(folderPath, folderName, ref);
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

app.post(
  '/api/programs/m1-visual/upload',
  express.raw({
    type: ['application/octet-stream', 'image/png', 'image/jpeg', 'image/bmp', 'image/webp', 'image/gif', 'image/svg+xml'],
    limit: '25mb',
  }),
  (req, res) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      const query = req.query as Record<string, string | undefined>;
      const body = (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : {}) as Record<
        string,
        unknown
      >;

      let stitchType;
      if (buffer.length > 0) {
        stitchType = saveM1VisualBuffer({
          stitchId: String(query.stitch_id ?? query.stitchId ?? ''),
          slot: String(query.slot ?? ''),
          fileName: String(query.file_name ?? query.fileName ?? 'upload.png'),
          mimeType: String(query.mime_type ?? query.mimeType ?? req.headers['content-type'] ?? ''),
          buffer,
        });
      } else {
        stitchType = saveM1VisualUpload({
          stitchId: String(body.stitch_id ?? body.stitchId ?? ''),
          slot: String(body.slot ?? ''),
          fileName: String(body.file_name ?? body.fileName ?? ''),
          dataBase64: String(body.data_base64 ?? body.dataBase64 ?? ''),
          mimeType: String(body.mime_type ?? body.mimeType ?? ''),
        });
      }

      res.json({ ok: true, stitchType });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao gravar imagem.' });
    }
  }
);

app.use(express.json({ limit: '32mb' }));

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
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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

app.get('/api/programs/sintral-yarns', async (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    scanAllProgramsRoots();

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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

app.get('/api/programs/sintral-times', async (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    await scanAllSintralScreens();

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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

    scanAllProgramsRoots();
    await scanAllSintralScreens();

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
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

app.get('/api/programs/m1-density', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const partFile = String(req.query.part ?? req.query.file ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const partRows = listPartsInFolder(match.folder_path, folderName, ref);

    if (partFile) {
      const partRow =
        partRows.find((p) => p.file_name.toLowerCase() === partFile.toLowerCase()) ??
        partRows.find((p) => p.label.toLowerCase() === partFile.toLowerCase());
      if (!partRow) {
        res.status(404).json({ error: `Parte "${partFile}" não encontrada.` });
        return;
      }
      res.json({
        reference: ref,
        folder_path: match.folder_path,
        part: readM1DensityForPart(STOLL_TMP, match.folder_path, partRow),
        machine: machinePayload(match.folder_path, partRows),
      });
      return;
    }

    const parts = readM1DensityForModel(STOLL_TMP, match.folder_path, partRows);
    res.json({
      reference: ref,
      folder_path: match.folder_path,
      parts,
      filled: parts.filter((row) => row.ok).length,
      total: parts.length,
      machine: machinePayload(match.folder_path, partRows),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler densidade M1.' });
  }
});

app.get('/api/programs/m1-knowledge', (_req, res) => {
  try {
    const lib = readM1Knowledge();
    res.json({ ...lib, stitchTypes: stitchTypesWithVisualUrls() });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler base M1.' });
  }
});

app.get('/api/programs/m1-visual/file', (req, res) => {
  try {
    const stitchId = String(req.query.stitch ?? '').trim();
    const slot = String(req.query.slot ?? '').trim();
    const file = resolveM1VisualFile(stitchId, slot as 'stitch' | 'icon' | 'malhas');
    if (!file) {
      res.status(404).json({ error: 'Imagem não encontrada.' });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.type(file.mime);
    res.send(fs.readFileSync(file.full));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao ler imagem.' });
  }
});

app.get('/api/programs/m1-symbols', (_req, res) => {
  try {
    res.json(knittSymForApi());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler knitt.sym.' });
  }
});

app.get('/api/programs/m1-fabric-lib', (_req, res) => {
  try {
    res.json(m1FabricLibForApi());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler biblioteca tecido M1.' });
  }
});

app.get('/api/programs/m1-bitmaps', (_req, res) => {
  try {
    res.json(listM1BitmapCatalog());
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao listar bitmaps M1.' });
  }
});

app.get('/api/programs/m1-bitmap/file', (req, res) => {
  try {
    const name = String(req.query.name ?? '').trim();
    const file = resolveM1BitmapFile(name);
    if (!file) {
      res.status(404).json({ error: 'Bitmap não encontrado.' });
      return;
    }
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.type('image/bmp');
    res.send(fs.readFileSync(file.full));
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao ler bitmap.' });
  }
});

app.get('/api/programs/m1-bitmap/suggest', (req, res) => {
  try {
    const code = String(req.query.code ?? '').trim();
    const catalog = listM1BitmapCatalog();
    res.json({ item: code ? suggestBitmapForStitchCode(code, catalog) : null });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao sugerir bitmap.' });
  }
});

app.get('/api/programs/m1-mesh', (req, res) => {
  try {
    const ref = String(req.query.ref ?? '').trim();
    const partFile = String(req.query.part ?? req.query.file ?? '').trim();
    const full = req.query.full === '1' || req.query.full === 'true';
    if (!ref) {
      res.status(400).json({ error: 'Informe a referência.' });
      return;
    }

    const match = findProgramFolder(ref, full);
    if (!match) {
      res.status(404).json({
        error: full
          ? `Referência ${ref} não encontrada em ${programsRootsLabel()}.`
          : `Referência ${ref} não encontrada nos últimos ${SEARCH_DAYS} dias.`,
      });
      return;
    }

    const folderName = path.basename(match.folder_path);
    const partRows = listPartsInFolder(match.folder_path, folderName, ref);

    if (partFile) {
      const partRow =
        partRows.find((p) => p.file_name.toLowerCase() === partFile.toLowerCase()) ??
        partRows.find((p) => p.label.toLowerCase() === partFile.toLowerCase());
      if (!partRow) {
        res.status(404).json({ error: `Parte "${partFile}" não encontrada.` });
        return;
      }
      res.json({
        reference: ref,
        folder_path: match.folder_path,
        part: readM1MeshForPart(STOLL_TMP, match.folder_path, partRow),
      });
      return;
    }

    const parts = readM1MeshForModel(STOLL_TMP, match.folder_path, partRows);
    res.json({
      reference: ref,
      folder_path: match.folder_path,
      parts,
      filled: parts.filter((row) => row.ok).length,
      total: parts.length,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao ler malha M1.' });
  }
});

app.post('/api/programs/m1-stitch-types', (req, res) => {
  try {
    const body = req.body ?? {};
    const stitchType = upsertM1StitchType({
      id: String(body.id ?? ''),
      code: String(body.code ?? ''),
      name: String(body.name ?? ''),
    });
    res.json({ ok: true, stitchType });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao gravar tipo de ponto.' });
  }
});

app.post('/api/programs/m1-measurements', (req, res) => {
  try {
    const body = req.body ?? {};
    const reference = String(body.reference ?? '').trim();
    const partLabel = String(body.part_label ?? body.partLabel ?? '').trim();
    const widthCm = Number(String(body.width_cm ?? body.widthCm ?? '').replace(',', '.'));
    const heightCm = Number(String(body.height_cm ?? body.heightCm ?? '').replace(',', '.'));
    const wales = Number(body.wales);
    const courses = Number(body.courses);

    if (!reference || !partLabel) {
      res.status(400).json({ error: 'Informe referência e parte.' });
      return;
    }
    if (!(wales > 0) || !(courses > 0)) {
      res.status(400).json({ error: 'Malhas e passadas devem ser maiores que zero.' });
      return;
    }

    const density = computeDensity(wales, courses, widthCm, heightCm);
    const machineRaw = body.machine ?? {};
    const machine = {
      cms: String(machineRaw.cms ?? '').trim(),
      gauge: String(machineRaw.gauge ?? '').trim(),
      label: String(machineRaw.label ?? '').trim(),
      syntechMaquina:
        machineRaw.syntechMaquina ??
        machineRaw.syntech_maquina ??
        null,
    };

    const row = addM1Measurement({
      reference,
      programFolder: String(body.program_folder ?? body.programFolder ?? '').trim(),
      partBase: String(body.part_base ?? body.partBase ?? '').trim(),
      partLabel,
      machine,
      swatch: { widthCm, heightCm, fabricState: 'raw' },
      programCounts: {
        wales,
        courses,
        source: String(body.program_counts_source ?? 'sin'),
      },
      density,
      regulation: body.regulation ?? {
        primarySource: 'sin',
        sinNps: [],
        setxNps: [],
      },
      stitchTypeId: body.stitch_type_id ?? body.stitchTypeId,
      stitchTypeCode: body.stitch_type_code ?? body.stitchTypeCode,
      yarns: Array.isArray(body.yarns) ? body.yarns : [],
      files: body.files ?? {},
      notes: String(body.notes ?? '').trim(),
    });

    res.json({ ok: true, measurement: row });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao gravar medição.' });
  }
});

app.get('/api/programs/m1-similar', (req, res) => {
  try {
    const syntechCod = req.query.syntech_cod ? Number(req.query.syntech_cod) : undefined;
    const rows = findSimilarMeasurements({
      syntechCod: Number.isFinite(syntechCod) ? syntechCod : undefined,
      sinDescriptionKey: String(req.query.yarn_key ?? '').trim() || undefined,
      cms: String(req.query.cms ?? '').trim() || undefined,
      gauge: String(req.query.gauge ?? '').trim() || undefined,
      stitchTypeCode: String(req.query.stitch ?? '').trim() || undefined,
      excludeId: String(req.query.exclude_id ?? '').trim() || undefined,
      limit: req.query.limit ? Number(req.query.limit) : 12,
    });
    res.json({ items: rows });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao buscar similares.' });
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

app.get('/api/programs/syntech-producao', async (_req, res) => {
  try {
    const board = await readSyntechProducaoBoard();
    res.json(board);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao ler produção do Syntech.',
    });
  }
});

app.get('/api/quadro', async (_req, res) => {
  try {
    const board = await readSyntechProducaoBoard();
    res.json(board);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao ler o quadro do Syntech.',
    });
  }
});

app.get('/api/programs/desenv-pendentes', async (req, res) => {
  try {
    const q = String(req.query.q ?? '');
    res.json({ itens: await listSyntechDesenvPendentes(q) });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Erro ao ler os desenvolvimentos no Syntech.',
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

app.post('/api/programs/cadastro-pdf', async (req, res) => {
  try {
    const reference = String(req.body?.reference ?? '').trim();
    const cadastro = req.body?.cadastro;
    const full = req.body?.full_search === true || req.body?.full === true;
    let model_folder = String(req.body?.model_folder ?? '').trim();

    if (!reference || !cadastro || typeof cadastro !== 'object') {
      res.status(400).json({ error: 'Informe referência e dados do cadastro.' });
      return;
    }

    if (!model_folder) {
      const match = findProgram(reference, full);
      if (match) model_folder = match.folder_path;
    }

    if (!model_folder || !fs.existsSync(model_folder)) {
      res.status(404).json({ error: 'Pasta do programa não encontrada.' });
      return;
    }

    const dadosDir = path.join(model_folder, DADOS_PROGRAMA_DIR);
    fs.mkdirSync(dadosDir, { recursive: true });
    const fileName = cadastroPdfFileName(reference);
    const filePath = path.join(dadosDir, fileName);
    const parts = Array.isArray(cadastro.parts) ? cadastro.parts : [];
    const machineFromSin = machinePayload(
      model_folder,
      parts.map((part: { file_name?: string }) => ({ file_name: String(part?.file_name ?? '') }))
    );
    const pdf = buildCadastroPdfBuffer({
      reference,
      name: String(cadastro.name ?? ''),
      parts,
      yarn_parts: Array.isArray(cadastro.yarn_parts) ? cadastro.yarn_parts : [],
      observations: String(cadastro.observations ?? ''),
      updated_at: String(cadastro.updated_at ?? new Date().toISOString()),
      machine_cms: String(cadastro.machine_cms ?? machineFromSin?.cms ?? ''),
      machine_gauge: String(cadastro.machine_gauge ?? machineFromSin?.gauge ?? ''),
      machine_label: String(cadastro.machine_label ?? machineFromSin?.label ?? ''),
      yarn_types: yarnTypesFromCatalog(),
    });
    fs.writeFileSync(filePath, pdf);
    openLocalFile(filePath);

    res.json({ ok: true, path: filePath, file_name: fileName, opened: true });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : 'Erro ao gerar PDF.' });
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

app.post('/api/programs/backup', async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      localOnly?: boolean;
      firestoreOnly?: boolean;
      firestore?: BackupRequest['firestore'];
    };
    const result = await handleBackupRequest({
      localOnly: body.localOnly === true,
      firestoreOnly: body.firestoreOnly === true,
      firestore: body.firestore,
    });
    res.json({
      ok: true,
      ...result,
    });
  } catch (err) {
    res.status(err instanceof Error && err.message.includes('em andamento') ? 409 : 500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'Falha ao gerar backup.',
    });
  }
});

app.get('/api/programs/health', (_req, res) => {
  const roots = getProgramsRoots();
  res.json({
    ok: true,
    version: 34,
    sintral_capture: SINTRAL_CAPTURE_BUILD,
    m1_sin_capture: M1_SIN_CAPTURE_BUILD,
    root: formatProgramsRootsLabel(roots),
    roots,
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
      'syntech-producao',
      'syntech-paradas',
      'desenv-pendentes',
      'cadastro-pdf',
      'm1-density',
      'm1-knowledge',
      'm1-measurements',
      'm1-similar',
      'm1-visual',
      'm1-symbols',
      'm1-bitmaps',
      'm1-mesh',
      'm1-fabric-lib',
      'backup',
    ],
  });
});

app.listen(PORT, '127.0.0.1', () => {
  const roots = getProgramsRoots();
  if (roots.length === 0) {
    console.warn('Nenhuma pasta PROGRAMAS encontrada. Verifique PROGRAMS_ROOTS no .env');
  } else {
    console.log(`Pastas PROGRAMAS: ${formatProgramsRootsLabel(roots)}`);
    startM1SinCaptureWatcher(STOLL_TMP);
    startSintralScreenWatcher();
  }
  console.log(`Scanner de programas em http://127.0.0.1:${PORT} (${SEARCH_DAYS} dias)`);
  console.log(`${M1_SIN_CAPTURE_BUILD}: M1 processa → .sin + .simx em dados do programa/{{parte}}/`);
  console.log('Sintral tela: cheque aberto → controle-sintral.json + .txt em dados do programa/{parte}/');
});
