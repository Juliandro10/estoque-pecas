import fs from 'node:fs';
import path from 'node:path';

import { parsePartBaseFromSin } from './m1-capture';
import {
  copyPartDataFile,
  fileMtimeMs,
  findModelFolderForPartInRoots,
  listDirFiles,
  sintralPartDir,
  writePartManifest,
} from './sintral-capture';

export const M1_SIN_CAPTURE_BUILD = 'v20-m1-sin-simx';

export type M1ProcessCaptureEvent = {
  part_base: string;
  model_folder: string;
  dest_dir: string;
  files: string[];
  anchor_ms: number;
  at: string;
};

const RECENT_PROCESS_MS = Number(process.env.M1_SIN_RECENT_MS ?? 20 * 60 * 1000);
const PAIR_WINDOW_MS = 8 * 60 * 1000;
const MANIFEST_FILE = 'ultimo-processo.json';

let lastEvents: M1ProcessCaptureEvent[] = [];
let lastCapturedAnchor = new Map<string, number>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function isM1ProcessSinName(name: string) {
  if (!/\.sin$/i.test(name)) return false;
  if (/^McDataTmp/i.test(name)) return false;
  if (/^~+\$/i.test(name)) return false;
  return true;
}

function isM1ProcessSimxName(name: string) {
  if (!/\.simx$/i.test(name)) return false;
  if (/^sc_tmp/i.test(name)) return false;
  if (/^~+\$/i.test(name)) return false;
  return true;
}

function partBaseFromSinPath(tmpDir: string, fileName: string) {
  const sinPath = path.join(tmpDir, fileName);
  const fromName = fileName.replace(/\.sin$/i, '');

  try {
    const parsed = parsePartBaseFromSin(fs.readFileSync(sinPath, 'utf8'));
    if (parsed) return parsed;
  } catch {
    // ignore
  }

  return fromName;
}

function detectM1ProcessSin(tmpDir: string, maxAgeMs = RECENT_PROCESS_MS) {
  const triggers = new Map<string, number>();
  const now = Date.now();

  for (const entry of listDirFiles(tmpDir)) {
    if (!isM1ProcessSinName(entry.name)) continue;

    const sinPath = path.join(tmpDir, entry.name);
    const sinMs = fileMtimeMs(sinPath);
    if (!sinMs || now - sinMs > maxAgeMs) continue;

    const partBase = partBaseFromSinPath(tmpDir, entry.name);
    if (!partBase) continue;

    triggers.set(partBase.toLowerCase(), Math.max(sinMs, triggers.get(partBase.toLowerCase()) ?? 0));
  }

  return triggers;
}

function archiveProcessSnapshot(partDir: string, anchorMs: number, copiedNames: string[]) {
  const stamp = new Date(anchorMs).toISOString().replace(/[:.]/g, '-');
  const histDir = path.join(partDir, 'historico', stamp);
  fs.mkdirSync(histDir, { recursive: true });

  for (const name of copiedNames) {
    const src = path.join(partDir, name);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(histDir, name));
  }

  const manifest = path.join(partDir, MANIFEST_FILE);
  if (fs.existsSync(manifest)) fs.copyFileSync(manifest, path.join(histDir, MANIFEST_FILE));
}

function findSinFileInTmp(tmpDir: string, partBase: string) {
  const target = partBase.toLowerCase();
  for (const entry of listDirFiles(tmpDir)) {
    if (!isM1ProcessSinName(entry.name)) continue;
    if (entry.name.replace(/\.sin$/i, '').toLowerCase() !== target) continue;
    return { fileName: entry.name, sinPath: path.join(tmpDir, entry.name) };
  }
  return null;
}

function findSimxSource(tmpDir: string, modelFolder: string, partBase: string, anchorMs: number) {
  const target = partBase.toLowerCase();
  let best: { path: string; mtime: number } | null = null;

  const candidates: string[] = [];
  for (const entry of listDirFiles(tmpDir)) {
    if (!isM1ProcessSimxName(entry.name)) continue;
    if (entry.name.replace(/\.simx$/i, '').toLowerCase() !== target) continue;
    candidates.push(path.join(tmpDir, entry.name));
  }
  candidates.push(path.join(modelFolder, `${partBase}.simx`));

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    const mtime = fileMtimeMs(candidate);
    if (!mtime) continue;
    const near = Math.abs(mtime - anchorMs) <= PAIR_WINDOW_MS;
    const recent = Date.now() - mtime <= RECENT_PROCESS_MS;
    if (!near && !recent) continue;
    if (!best || mtime > best.mtime) best = { path: candidate, mtime };
  }

  return best?.path ?? null;
}

function captureM1Process(
  tmpDir: string,
  partBase: string,
  anchorMs: number
): M1ProcessCaptureEvent | null {
  const key = partBase.toLowerCase();
  const prev = lastCapturedAnchor.get(key) ?? 0;
  if (anchorMs <= prev) return null;

  const modelFolder = findModelFolderForPartInRoots(partBase);
  if (!modelFolder) return null;

  const hit = findSinFileInTmp(tmpDir, partBase);
  if (!hit) return null;

  const resolvedPartBase = partBaseFromSinPath(tmpDir, hit.fileName);
  const copied: string[] = [];

  const sinDest = `${resolvedPartBase}.sin`;
  if (copyPartDataFile(hit.sinPath, modelFolder, resolvedPartBase, sinDest)) copied.push(sinDest);

  const simxSrc = findSimxSource(tmpDir, modelFolder, resolvedPartBase, anchorMs);
  const simxDest = `${resolvedPartBase}.simx`;
  if (simxSrc && copyPartDataFile(simxSrc, modelFolder, resolvedPartBase, simxDest)) {
    copied.push(simxDest);
  }

  if (!copied.length) return null;

  const partDir = sintralPartDir(modelFolder, resolvedPartBase);
  const manifest = {
    part_base: resolvedPartBase,
    model_folder: modelFolder,
    captured_at: new Date().toISOString(),
    anchor_ms: Math.round(anchorMs),
    source: 'm1-process',
    tmp_dir: tmpDir,
    files: copied.map((name) => ({
      name,
      size: fs.statSync(path.join(partDir, name)).size,
      mtime: new Date(fileMtimeMs(path.join(partDir, name))).toISOString(),
    })),
  };

  writePartManifest(partDir, MANIFEST_FILE, manifest);
  archiveProcessSnapshot(partDir, anchorMs, copied);

  lastCapturedAnchor.set(key, anchorMs);

  const event: M1ProcessCaptureEvent = {
    part_base: resolvedPartBase,
    model_folder: modelFolder,
    dest_dir: partDir,
    files: copied,
    anchor_ms: anchorMs,
    at: manifest.captured_at,
  };
  lastEvents = [event, ...lastEvents].slice(0, 40);
  return event;
}

export function scanM1SinCaptures(tmpDir: string, _programsRoot?: string, maxAgeMs = RECENT_PROCESS_MS) {
  if (!fs.existsSync(tmpDir)) {
    return { captured: 0, triggers: 0, events: [] as M1ProcessCaptureEvent[] };
  }

  const triggers = detectM1ProcessSin(tmpDir, maxAgeMs);
  const events: M1ProcessCaptureEvent[] = [];

  for (const [partKey, anchorMs] of triggers) {
    const sinEntry = listDirFiles(tmpDir).find(
      (entry) =>
        isM1ProcessSinName(entry.name) && entry.name.replace(/\.sin$/i, '').toLowerCase() === partKey
    );
    if (!sinEntry) continue;

    const partBase = partBaseFromSinPath(tmpDir, sinEntry.name);
    const event = captureM1Process(tmpDir, partBase, anchorMs);
    if (event) events.push(event);
  }

  return { captured: events.length, triggers: triggers.size, events };
}

export function getM1SinCaptureStatus() {
  return {
    recent: lastEvents.slice(0, 15),
    tracked_parts: lastCapturedAnchor.size,
  };
}

export function startM1SinCaptureWatcher(tmpDir: string, _programsRoot?: string, intervalMs = 400) {
  if (pollTimer) return;
  scanM1SinCaptures(tmpDir);
  pollTimer = setInterval(() => {
    try {
      scanM1SinCaptures(tmpDir);
    } catch {
      // Tmp pode estar sendo escrito pelo M1
    }
  }, intervalMs);
}
