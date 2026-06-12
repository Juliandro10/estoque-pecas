import fs from 'node:fs';
import path from 'node:path';

import {
  findBestCfgxForPart,
  readCfgxSecondsFromFile,
  scanZipArchivesForCfgx,
} from './cfgx-io';
import { readControleSintralForPart, SCREEN_FILE } from './sintral-screen';
import { sintralPartDir } from './sintral-capture';
import { isIgnoredProgramSubfolder } from './program-folders';

export type M1TimeResult = {
  time_mmss: string;
  seconds: number;
  source: 'tela' | 'cfgx' | 'xml' | 'mdv';
  part_base: string;
  files: {
    tela?: string;
    cfgx?: string;
    xml?: string;
    simx?: string;
    mdv?: string;
    setx?: string;
    sin?: string;
    jac?: string;
  };
};

export type M1TimeBatchPart = {
  label: string;
  file_name: string;
  ok: boolean;
  time_mmss?: string;
  source?: 'tela' | 'cfgx' | 'xml' | 'mdv';
  error?: string;
};

export type M1TimeBatchResult = {
  reference: string;
  folder_path: string;
  parts: M1TimeBatchPart[];
  filled: number;
  total: number;
};

const MATCH_WINDOW_MS = 25 * 60 * 1000;
const RECENT_CHECK_MS = 12 * 60 * 1000;

function formatMmSs(totalSec: number) {
  const rounded = Math.max(0, Math.round(totalSec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function partBaseFromFileName(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim();
}

function partTokens(partBase: string) {
  const ref = partBase.match(/^(\d+)/)?.[1] ?? '';
  const label = partBase.split('-').pop()?.toUpperCase() ?? '';
  return { ref, label };
}

function searchDirs(modelFolder: string | undefined, tmpDir: string) {
  const dirs: string[] = [];
  const captureDirPath = path.join(tmpDir, '.m1-capture');
  if (fs.existsSync(captureDirPath)) dirs.push(captureDirPath);
  if (fs.existsSync(tmpDir)) dirs.push(tmpDir);
  if (modelFolder && fs.existsSync(modelFolder)) {
    const dadosRoot = path.join(modelFolder, 'dados do programa');
    if (fs.existsSync(dadosRoot)) {
      try {
        for (const entry of fs.readdirSync(dadosRoot, { withFileTypes: true })) {
          if (entry.isDirectory() && entry.name !== 'historico' && !isIgnoredProgramSubfolder(entry.name)) {
            dirs.push(path.join(dadosRoot, entry.name));
          }
        }
      } catch {
        // ignore
      }
    }
  }
  return dirs;
}

function stollExtractDirs() {
  const fromEnv = (process.env.STOLL_EXTRACT ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter(Boolean);
  const defaults = [
    'C:\\Stoll\\M1plus\\8.0.010\\Extract',
    'C:\\Stoll\\M1plus\\7.9.027\\Extract',
    'C:\\Stoll\\M1plus\\7.6.047\\Extract',
  ];
  return [...new Set([...fromEnv, ...defaults])].filter((dir) => fs.existsSync(dir));
}

function allSearchDirs(modelFolder: string | undefined, tmpDir: string) {
  const dirs = searchDirs(modelFolder, tmpDir);
  for (const dir of stollExtractDirs()) {
    if (!dirs.includes(dir)) dirs.push(dir);
  }
  return dirs;
}

function parseKnittingTimeSeconds(xmlText: string): number | null {
  const block = xmlText.match(/<productivity[\s\S]*?<\/productivity>/i)?.[0] ?? xmlText;
  const tag = block.match(/<knittingTime\b([^>]*)>([\d.]+)<\/knittingTime>/i);
  if (!tag) return null;

  const value = Number(tag[2]);
  if (!(value > 0)) return null;

  const unit = tag[1].match(/\bunit="([^"]+)"/i)?.[1]?.toLowerCase() ?? 's';
  if (unit === 'min') return value * 60;
  if (unit === 'h') return value * 3600;
  return value;
}

function simXmlMatchesPart(xmlText: string, partBase: string) {
  const pattern = xmlText.match(/<pattern\b[^>]*type="mdv"[^>]*>([^<]+)<\/pattern>/i)?.[1];
  if (pattern && pattern.trim().replace(/\.mdv$/i, '').toLowerCase() === partBase.toLowerCase()) {
    return true;
  }

  for (const tag of ['sintral', 'setup', 'jacquard'] as const) {
    const name = xmlText.match(new RegExp(`<${tag}>([^<]+)<\\/${tag}>`, 'i'))?.[1];
    if (!name) continue;
    const base = name.trim().replace(/\.(sin|setx?|jac)$/i, '');
    if (base.toLowerCase() === partBase.toLowerCase()) return true;
  }

  return false;
}

function hasProductivityTime(text: string) {
  return parseKnittingTimeSeconds(text) !== null;
}

function findProductivityReport(
  dirs: string[],
  partBase: string,
  ref: string,
  label: string
) {
  const candidates = new Set<string>();

  for (const dir of dirs) {
    for (const ext of ['.simx', '.xml', '.cfgx'] as const) {
      const named = findNamedFile(dir, partBase, ext);
      if (named) candidates.add(named);
    }
    const report = findNamedFile(dir, partBase, '-report.simx');
    if (report) candidates.add(report);

    for (const entry of listDirFiles(dir)) {
      if (!/\.(simx|xml|cfgx)$/i.test(entry.name)) continue;
      if (/^sc_tmp/i.test(entry.name)) continue;
      if (!matchesPartName(entry.name, partBase, ref, label)) continue;
      candidates.add(path.join(dir, entry.name));
    }
  }

  let best: { path: string; mtime: number; size: number } | null = null;

  for (const full of candidates) {
    let size = 0;
    try {
      size = fs.statSync(full).size;
    } catch {
      continue;
    }

    if (size > 100_000) continue;

    let text: string;
    try {
      text = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }

    if (!hasProductivityTime(text)) continue;
    if (!simXmlMatchesPart(text, partBase) && !matchesPartName(path.basename(full), partBase, ref, label)) {
      continue;
    }

    const mtime = fileMtimeMs(full);
    const rank = size <= 100_000 ? 0 : 1;
    const bestRank = best ? (best.size <= 100_000 ? 0 : 1) : 99;
    if (!best || rank < bestRank || (rank === bestRank && mtime > best.mtime)) {
      best = { path: full, mtime, size };
    }
  }

  return best?.path ?? null;
}

function countUint32Hits(buf: Buffer, value: number) {
  const needle = Buffer.alloc(4);
  needle.writeUInt32LE(value);
  let count = 0;
  let idx = 0;
  while ((idx = buf.indexOf(needle, idx)) >= 0) {
    count++;
    idx++;
  }
  return count;
}

function readSimRowsFromSimx(simxPath: string | undefined) {
  if (!simxPath || !fs.existsSync(simxPath)) return 0;
  try {
    const head = fs.readFileSync(simxPath, 'utf8').slice(0, 16_384);
    return Number(head.match(/<simRows>(\d+)<\/simRows>/)?.[1] ?? 0);
  } catch {
    return 0;
  }
}

function isMdvSyncedWithCheck(mdvMs: number, simxMs: number, sinMs: number) {
  const anchor = Math.max(simxMs, sinMs);
  if (!mdvMs || !anchor) return false;
  if (mdvMs < anchor - 120_000) return false;
  return Math.abs(mdvMs - anchor) <= 15 * 60 * 1000;
}

function orderedTargets(label: string, simRows: number) {
  const body = simRows + 17;
  const mg = simRows - 172;
  const gola = simRows - 24;
  const extra = simRows + 40;
  const u = label.toUpperCase();
  if (u === 'MG' || u.includes('MANG')) return [mg, body, gola, extra];
  if (u === 'GOLA' || u.includes('GOLA')) return [gola, body, mg, extra];
  return [body, mg, gola, extra];
}

function readKnittingTimeFromMdvBuffer(buf: Buffer, simRows: number, label: string): number | null {
  if (simRows <= 0) return null;

  const targets = orderedTargets(label, simRows);
  const candidates: { sec: number; targetDist: number; targetIdx: number; trip: number; offset: number }[] = [];

  for (let offset = 4; offset < buf.length - 4; offset += 4) {
    const sec = buf.readUInt32LE(offset);
    if (sec < 120 || sec > 7200) continue;
    if (buf.readUInt32LE(offset - 4) !== sec - 1) continue;
    if (buf.readUInt32LE(offset + 4) !== sec + 1) continue;

    const hits = countUint32Hits(buf, sec);
    if (hits < 3 || hits > 4) continue;

    let trip = 0;
    for (let probe = 4; probe < buf.length - 4; probe += 4) {
      if (buf.readUInt32LE(probe) !== sec) continue;
      if (buf.readUInt32LE(probe - 4) === sec - 1 && buf.readUInt32LE(probe + 4) === sec + 1) {
        trip++;
      }
    }
    if (trip < 1) continue;

    const ratio = offset / buf.length;
    if (ratio < 0.04 || ratio > 0.28) continue;

    let targetIdx = 0;
    let targetDist = Infinity;
    for (let i = 0; i < targets.length; i++) {
      const dist = Math.abs(sec - targets[i]!);
      if (dist < targetDist) {
        targetDist = dist;
        targetIdx = i;
      }
    }
    candidates.push({ sec, targetDist, targetIdx, trip, offset });
  }

  if (candidates.length === 0) return null;

  candidates.sort(
    (a, b) =>
      a.targetDist - b.targetDist ||
      a.targetIdx - b.targetIdx ||
      b.trip - a.trip ||
      a.offset - b.offset
  );
  return candidates[0]?.sec ?? null;
}

function findMdvForPart(dirs: string[], partBase: string, ref: string, label: string) {
  const direct = findNamedInDirs(dirs, partBase, '.mdv');
  if (direct) return direct;

  for (const dir of dirs) {
    for (const entry of listDirFiles(dir)) {
      if (!/\.mdv$/i.test(entry.name)) continue;
      if (matchesPartName(entry.name, partBase, ref, label)) {
        return path.join(dir, entry.name);
      }
    }
  }
  return null;
}

function readMdvSeconds(mdvPath: string, simRows: number, label: string) {
  let buf: Buffer;
  try {
    buf = fs.readFileSync(mdvPath);
  } catch {
    return null;
  }
  return readKnittingTimeFromMdvBuffer(buf, simRows, label);
}

function findTmpMdvForPart(tmpDir: string, partBase: string, simxMs: number, sinMs: number) {
  if (!fs.existsSync(tmpDir)) return null;

  const partLower = partBase.toLowerCase();
  let best: { path: string; mtime: number } | null = null;

  for (const entry of listDirFiles(tmpDir)) {
    if (!entry.name.startsWith('~')) continue;
    if (!entry.name.toLowerCase().includes(partLower)) continue;
    if (!/mdv/i.test(entry.name)) continue;

    const full = path.join(tmpDir, entry.name);
    const mtime = fileMtimeMs(full);
    if (!isMdvSyncedWithCheck(mtime, simxMs, sinMs)) continue;
    if (!best || mtime > best.mtime) best = { path: full, mtime };
  }

  return best?.path ?? null;
}

function readCfgxSeconds(cfgxPath: string): number | null {
  return readCfgxSecondsFromFile(cfgxPath);
}

function fileMtimeMs(filePath: string) {
  try {
    return fs.statSync(filePath).mtimeMs;
  } catch {
    return 0;
  }
}

function listDirFiles(dir: string) {
  try {
    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());
  } catch {
    return [];
  }
}

function matchesPartName(name: string, partBase: string, ref: string, label: string) {
  const lower = name.toLowerCase();
  const baseLower = partBase.toLowerCase();
  if (lower.includes(baseLower)) return true;
  if (ref && label && lower.includes(ref) && lower.includes(label.toLowerCase())) return true;
  return false;
}

function findNamedFile(dir: string, base: string, ext: string) {
  const variants = [base, `${base}-P`];
  for (const name of variants) {
    const full = path.join(dir, `${name}${ext}`);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

function findNamedInDirs(dirs: string[], base: string, ext: string) {
  for (const dir of dirs) {
    const found = findNamedFile(dir, base, ext);
    if (found) return found;
  }
  return null;
}

function findFuzzyFile(
  dirs: string[],
  partBase: string,
  ref: string,
  label: string,
  ext: string
) {
  let best: { path: string; mtime: number } | null = null;
  for (const dir of dirs) {
    for (const entry of listDirFiles(dir)) {
      if (!entry.name.toLowerCase().endsWith(ext)) continue;
      if (!matchesPartName(entry.name, partBase, ref, label)) continue;
      const full = path.join(dir, entry.name);
      const mtime = fileMtimeMs(full);
      if (!best || mtime > best.mtime) best = { path: full, mtime };
    }
  }
  return best?.path ?? null;
}

function findPartActivityMs(dirs: string[], partBase: string, ref: string, label: string) {
  let latest = 0;
  for (const dir of dirs) {
    for (const entry of listDirFiles(dir)) {
      if (!matchesPartName(entry.name, partBase, ref, label)) continue;
      if (
        !/(\.jac|\.mdv|\.simx)/i.test(entry.name) &&
        !entry.name.startsWith('~$$')
      ) {
        continue;
      }
      latest = Math.max(latest, fileMtimeMs(path.join(dir, entry.name)));
    }
  }
  return latest;
}

function findMcDataTmpSetx(tmpDir: string, anchorMs: number) {
  const setx = path.join(tmpDir, 'McDataTmp.setx');
  const setxMs = fileMtimeMs(setx);
  if (!setxMs) return null;

  const now = Date.now();
  const recent = now - setxMs <= RECENT_CHECK_MS;
  const nearAnchor = anchorMs > 0 && Math.abs(setxMs - anchorMs) <= 8 * 60 * 1000;
  if (!recent && !nearAnchor) return null;

  return setx;
}

function findMcDataTmpFiles(tmpDir: string, activityMs: number) {
  const sin = path.join(tmpDir, 'McDataTmp.sin');
  const setx = path.join(tmpDir, 'McDataTmp.setx');
  const sinMs = fileMtimeMs(sin);
  const setxMs = fileMtimeMs(setx);
  const now = Date.now();

  if (!sinMs || !setxMs) {
    return { sin: null, setx: null, sinMs, setxMs };
  }

  const pairClose = Math.abs(sinMs - setxMs) <= 5 * 60 * 1000;
  const pairRecent = now - sinMs <= RECENT_CHECK_MS && now - setxMs <= RECENT_CHECK_MS;
  const pairNearActivity =
    activityMs > 0 &&
    Math.abs(sinMs - activityMs) <= 8 * 60 * 1000 &&
    Math.abs(setxMs - activityMs) <= 8 * 60 * 1000;

  if (!pairClose || (!pairRecent && !pairNearActivity)) {
    return { sin: null, setx: null, sinMs, setxMs };
  }

  return { sin, setx, sinMs, setxMs };
}

function findScTmpSimx(tmpDir: string, anchorMs: number) {
  let best: { path: string; delta: number } | null = null;
  const now = Date.now();

  for (const entry of listDirFiles(tmpDir)) {
    if (!/^sc_tmp.*\.simx$/i.test(entry.name)) continue;
    const full = path.join(tmpDir, entry.name);
    const mtime = fileMtimeMs(full);
    if (!mtime) continue;

    if (anchorMs > 0) {
      const delta = Math.abs(mtime - anchorMs);
      if (delta > MATCH_WINDOW_MS) continue;
      if (!best || delta < best.delta) best = { path: full, delta };
      continue;
    }

    if (now - mtime <= RECENT_CHECK_MS) {
      const delta = now - mtime;
      if (!best || delta < best.delta) best = { path: full, delta };
    }
  }

  return best?.path ?? null;
}

function findCfgxForPart(
  dirs: string[],
  partBase: string,
  ref: string,
  label: string,
  anchorMs = 0,
  tmpDir?: string
) {
  const captureDirPath = tmpDir ? path.join(tmpDir, '.m1-capture') : dirs[0] ?? '';
  if (captureDirPath && fs.existsSync(captureDirPath)) {
    scanZipArchivesForCfgx(dirs, captureDirPath, partBase, ref, label);
  }
  return findBestCfgxForPart(dirs, partBase, ref, label, anchorMs);
}

function resolvePartFiles(dirs: string[], tmpDir: string, partBase: string) {
  const { ref, label } = partTokens(partBase);
  const activityMs = findPartActivityMs(dirs, partBase, ref, label);

  const sin =
    findNamedInDirs(dirs, partBase, '.sin') ??
    findFuzzyFile(dirs, partBase, ref, label, '.sin');
  const setx =
    findNamedInDirs(dirs, partBase, '.setx') ??
    findNamedInDirs(dirs, partBase, '.set') ??
    findFuzzyFile(dirs, partBase, ref, label, '.setx') ??
    findFuzzyFile(dirs, partBase, ref, label, '.set');

  const mc = fs.existsSync(tmpDir) ? findMcDataTmpFiles(tmpDir, activityMs) : { sin: null, setx: null, sinMs: 0, setxMs: 0 };
  const jac =
    findNamedInDirs(dirs, partBase, '.jac') ??
    findFuzzyFile(dirs, partBase, ref, label, '.jac') ??
    undefined;

  const resolvedSin = sin ?? mc.sin ?? undefined;
  const simxEarly =
    findNamedInDirs(dirs, partBase, '.simx') ??
    findNamedInDirs(dirs, partBase, '-report.simx') ??
    findNamedInDirs(dirs, partBase, '-sc.simx') ??
    findFuzzyFile(dirs, partBase, ref, label, '.simx') ??
    undefined;
  const anchorForSetx = Math.max(activityMs, simxEarly ? fileMtimeMs(simxEarly) : 0);
  const resolvedSetx =
    setx ??
    mc.setx ??
    (fs.existsSync(tmpDir) ? findMcDataTmpSetx(tmpDir, anchorForSetx) : null) ??
    undefined;

  const anchorMs = Math.max(
    activityMs,
    resolvedSin ? fileMtimeMs(resolvedSin) : 0,
    resolvedSetx ? fileMtimeMs(resolvedSetx) : 0,
    simxEarly ? fileMtimeMs(simxEarly) : 0
  );

  const simx =
    simxEarly ??
    (fs.existsSync(tmpDir) ? findScTmpSimx(tmpDir, anchorMs) : null) ??
    undefined;

  const mdv = findMdvForPart(dirs, partBase, ref, label) ?? undefined;

  return {
    sin: resolvedSin,
    setx: resolvedSetx,
    simx,
    jac,
    mdv,
    activityMs,
    mc,
  };
}

function buildMissingSimulationError(partBase: string, resolved: ReturnType<typeof resolvePartFiles>) {
  const label = partBase.split('-').pop();
  const mdvPath = resolved.mdv;
  const simxMs = resolved.simx ? fileMtimeMs(resolved.simx) : 0;
  const sinMs = resolved.sin ? fileMtimeMs(resolved.sin) : 0;
  const mdvMs = mdvPath ? fileMtimeMs(mdvPath) : 0;
  const mdvStale = mdvMs > 0 && simxMs > 0 && !isMdvSyncedWithCheck(mdvMs, simxMs, sinMs);

  if (resolved.simx) {
    try {
      const simxText = fs.readFileSync(resolved.simx, 'utf8');
      const size = fs.statSync(resolved.simx).size;
      if (!hasProductivityTime(simxText) && size > 100_000) {
        if (mdvStale) {
          return `Parte "${label}": cheque OK, mas falta o relatório. No M1: Sintral Check → MC Program → Extract MC Program (marcar Report) → salvar na pasta do modelo. Depois clique Ler todos.`;
        }
        return `Parte "${label}": simx grande sem tempo. Use Extract MC Program com Report marcado para gerar o .cfgx.`;
      }
    } catch {
      // ignore
    }
  }
  if (resolved.jac || resolved.activityMs > 0) {
    return `Parte "${label}": tempo não encontrado. Rode Sintral Check e Extract MC Program com Report (.cfgx).`;
  }
  return `Parte "${label}" sem simulação encontrada.`;
}

export function readM1TimeForPart(
  tmpDir: string,
  partFileName: string,
  modelFolder?: string
): M1TimeResult {
  const partBase = partBaseFromFileName(partFileName);
  if (!partBase) {
    throw new Error('Informe o arquivo da parte (.mdv).');
  }

  const dirs = allSearchDirs(modelFolder, tmpDir);
  if (dirs.length === 0) {
    throw new Error('Pastas do M1 não encontradas.');
  }

  const { ref, label } = partTokens(partBase);
  const resolved = resolvePartFiles(dirs, tmpDir, partBase);
  const files: M1TimeResult['files'] = {
    sin: resolved.sin,
    setx: resolved.setx,
    simx: resolved.simx,
    jac: resolved.jac,
  };

  if (modelFolder) {
    const tela = readControleSintralForPart(modelFolder, partBase);
    if (tela?.seconds && tela.seconds > 0) {
      files.tela = path.join(sintralPartDir(modelFolder, partBase), SCREEN_FILE);
      return {
        time_mmss: tela.time_mmss,
        seconds: tela.seconds,
        source: 'tela',
        part_base: partBase,
        files,
      };
    }
  }

  const anchorMs = Math.max(
    resolved.simx ? fileMtimeMs(resolved.simx) : 0,
    resolved.sin ? fileMtimeMs(resolved.sin) : 0,
    resolved.activityMs
  );

  const cfgxPath = findCfgxForPart(dirs, partBase, ref, label, anchorMs, tmpDir);
  if (cfgxPath) {
    files.cfgx = cfgxPath;
    const seconds = readCfgxSeconds(cfgxPath);
    if (seconds !== null && seconds > 0) {
      return {
        time_mmss: formatMmSs(seconds),
        seconds,
        source: 'cfgx',
        part_base: partBase,
        files,
      };
    }
  }

  const reportPath = findProductivityReport(dirs, partBase, ref, label);

  if (reportPath) {
    const reportText = fs.readFileSync(reportPath, 'utf8');
    const seconds = parseKnittingTimeSeconds(reportText);
    if (seconds !== null && seconds > 0) {
      files.xml = reportPath;
      if (reportPath.toLowerCase().endsWith('.simx')) files.simx = reportPath;
      return {
        time_mmss: formatMmSs(seconds),
        seconds,
        source: 'xml',
        part_base: partBase,
        files,
      };
    }
  }

  const mdvPath =
    findTmpMdvForPart(tmpDir, partBase, resolved.simx ? fileMtimeMs(resolved.simx) : 0, resolved.sin ? fileMtimeMs(resolved.sin) : 0) ??
    resolved.mdv ??
    findMdvForPart(dirs, partBase, ref, label);
  if (mdvPath) {
    files.mdv = mdvPath;
    const simxMs = resolved.simx ? fileMtimeMs(resolved.simx) : 0;
    const sinMs = resolved.sin ? fileMtimeMs(resolved.sin) : 0;
    const mdvMs = fileMtimeMs(mdvPath);
    if (isMdvSyncedWithCheck(mdvMs, simxMs, sinMs)) {
      const simRows = readSimRowsFromSimx(resolved.simx);
      const seconds = readMdvSeconds(mdvPath, simRows, label);
      if (seconds !== null && seconds > 0) {
        return {
          time_mmss: formatMmSs(seconds),
          seconds,
          source: 'mdv',
          part_base: partBase,
          files,
        };
      }
    }
  }

  throw new Error(buildMissingSimulationError(partBase, resolved));
}

export function resolveStollPartFiles(
  tmpDir: string,
  modelFolder: string | undefined,
  partBase: string
) {
  const dirs = allSearchDirs(modelFolder, tmpDir);
  return resolvePartFiles(dirs, tmpDir, partBase);
}

export function readM1TimesForModel(
  tmpDir: string,
  modelFolder: string,
  parts: { label: string; file_name: string }[]
): M1TimeBatchPart[] {
  return parts.map((part) => {
    if (!part.file_name) {
      return { label: part.label, file_name: part.file_name, ok: false, error: 'Sem arquivo .mdv' };
    }
    try {
      const result = readM1TimeForPart(tmpDir, part.file_name, modelFolder);
      return {
        label: part.label,
        file_name: part.file_name,
        ok: true,
        time_mmss: result.time_mmss,
        source: result.source,
      };
    } catch (err) {
      return {
        label: part.label,
        file_name: part.file_name,
        ok: false,
        error: err instanceof Error ? err.message : 'Erro ao ler tempo.',
      };
    }
  });
}
