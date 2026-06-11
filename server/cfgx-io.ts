import AdmZip from 'adm-zip';
import fs from 'node:fs';
import path from 'node:path';

export function readCfgxSecondsFromText(text: string): number | null {
  const direct =
    text.match(/<knittingTimeSeconds>\s*(\d+(?:\.\d+)?)\s*<\/knittingTimeSeconds>/i)?.[1] ??
    text.match(/knittingTimeSeconds="(\d+(?:\.\d+)?)"/i)?.[1];
  if (direct) {
    const n = Number(direct);
    if (n > 0) return n;
  }

  const productivity = text.match(/<productivity[\s\S]*?<\/productivity>/i)?.[0] ?? text;
  const knitting = productivity.match(/<knittingTime\b([^>]*)>([\d.]+)<\/knittingTime>/i);
  if (knitting) {
    const value = Number(knitting[2]);
    if (value > 0) {
      const unit = knitting[1].match(/\bunit="([^"]+)"/i)?.[1]?.toLowerCase() ?? 's';
      if (unit === 'min') return value * 60;
      if (unit === 'h') return value * 3600;
      return value;
    }
  }

  const minutes =
    text.match(/<knittingTimeMinutes>\s*(\d+(?:\.\d+)?)\s*<\/knittingTimeMinutes>/i)?.[1] ??
    text.match(/knittingTimeMinutes="(\d+(?:\.\d+)?)"/i)?.[1];
  if (minutes) {
    const n = Number(minutes);
    if (n > 0) return n * 60;
  }

  return null;
}

export function readCfgxSecondsFromFile(cfgxPath: string): number | null {
  try {
    const text = fs.readFileSync(cfgxPath, 'utf8');
    return readCfgxSecondsFromText(text);
  } catch {
    return null;
  }
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

export function inferPartBaseFromCfgxName(fileName: string) {
  return fileName.replace(/\.cfgx$/i, '').trim();
}

export function extractCfgxFromZip(zipPath: string, destDir: string, partBase?: string) {
  if (!fs.existsSync(zipPath)) return null;

  let zip: AdmZip;
  try {
    zip = new AdmZip(zipPath);
  } catch {
    return null;
  }

  const entries = zip.getEntries().filter((e) => !e.isDirectory && /\.cfgx$/i.test(e.entryName));
  if (!entries.length) return null;

  fs.mkdirSync(destDir, { recursive: true });
  let best: { dest: string; mtime: number; seconds: number } | null = null;
  const zipMs = fileMtimeMs(zipPath);

  for (const entry of entries) {
    const baseName = path.basename(entry.entryName);
    if (partBase && !matchesPartName(baseName, partBase, '', '')) continue;

    const destName = partBase && baseName.toLowerCase().includes(partBase.toLowerCase()) ? `${partBase}.cfgx` : baseName;
    const dest = path.join(destDir, destName);

    let data: Buffer;
    try {
      data = entry.getData();
      fs.writeFileSync(dest, data);
      fs.utimesSync(dest, new Date(zipMs), new Date(zipMs));
    } catch {
      continue;
    }

    const seconds = readCfgxSecondsFromText(data.toString('utf8'));
    if (seconds === null || seconds <= 0) continue;

    if (!best || zipMs > best.mtime) {
      best = { dest, mtime: zipMs, seconds };
    }
  }

  return best?.dest ?? null;
}

export function scanZipArchivesForCfgx(
  dirs: string[],
  destDir: string,
  partBase: string,
  ref: string,
  label: string,
  maxAgeMs = 7 * 24 * 60 * 60 * 1000
) {
  const now = Date.now();
  let best: { path: string; mtime: number; seconds: number } | null = null;

  for (const dir of dirs) {
    for (const entry of listDirFiles(dir)) {
      if (!/\.zip$/i.test(entry.name)) continue;
      if (!matchesPartName(entry.name, partBase, ref, label)) continue;

      const zipPath = path.join(dir, entry.name);
      const zipMs = fileMtimeMs(zipPath);
      if (!zipMs || now - zipMs > maxAgeMs) continue;

      const extracted = extractCfgxFromZip(zipPath, destDir, partBase);
      if (!extracted) continue;

      const seconds = readCfgxSecondsFromFile(extracted);
      if (seconds === null || seconds <= 0) continue;

      if (!best || zipMs > best.mtime) {
        best = { path: extracted, mtime: zipMs, seconds };
      }
    }
  }

  return best?.path ?? null;
}

export function findBestCfgxForPart(
  dirs: string[],
  partBase: string,
  ref: string,
  label: string,
  anchorMs = 0
) {
  let best: { path: string; mtime: number; seconds: number; anchorDelta: number } | null = null;

  for (const dir of dirs) {
    for (const entry of listDirFiles(dir)) {
      if (!/\.cfgx$/i.test(entry.name)) continue;
      if (!matchesPartName(entry.name, partBase, ref, label)) continue;

      const full = path.join(dir, entry.name);
      const seconds = readCfgxSecondsFromFile(full);
      if (seconds === null || seconds <= 0) continue;

      const mtime = fileMtimeMs(full);
      const anchorDelta = anchorMs > 0 ? Math.abs(mtime - anchorMs) : 0;

      if (
        !best ||
        (anchorMs > 0 && anchorDelta < best.anchorDelta) ||
        (anchorMs > 0 && anchorDelta === best.anchorDelta && mtime > best.mtime) ||
        (anchorMs <= 0 && mtime > best.mtime)
      ) {
        best = { path: full, mtime, seconds, anchorDelta };
      }
    }
  }

  return best?.path ?? null;
}
