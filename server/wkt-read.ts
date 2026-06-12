import fs from 'node:fs';

import { filterSimxRowsByStrokeWidth } from './mesh-preview';

export type WktRow = {
  line: number;
  course: number;
  width: number;
  system: string;
  direction: string;
  mesh: string;
};

const KNIT_CHAR = /^[.\sA-Za-z+\-=*]$/;

export function sanitizeMeshString(mesh: string) {
  return [...mesh]
    .map((ch) => (KNIT_CHAR.test(ch) ? ch : '.'))
    .join('');
}

export type WktMeshResult = {
  ok: boolean;
  source: 'wkt-file' | 'simx' | null;
  path?: string;
  width: number | null;
  rows: WktRow[];
  error?: string;
};

function decodePackedUniform(buf: Buffer, size: number) {
  const ch = buf[buf.length - 1];
  return String.fromCharCode(ch).repeat(size);
}

function decodePackedPairRle(buf: Buffer, size: number, start = 4) {
  const out: number[] = [];
  let i = start;

  while (i + 4 <= buf.length && out.length < size) {
    const c1 = buf[i];
    const c2 = buf[i + 1];
    const count = buf[i + 3];
    i += 4;
    for (let k = 0; k < count; k++) {
      out.push(c1);
      if (c2 !== 0x00) out.push(c2);
      if (out.length >= size) break;
    }
  }

  while (out.length < size) out.push(0x2e);
  return String.fromCharCode(...out.slice(0, size));
}

function decodePackedSingleRle(buf: Buffer, size: number) {
  const prefix: number[] = [];
  let i = 4;

  if (i + 3 < buf.length && buf[i + 3] === 0x80) {
    const ch = buf[i];
    const count = buf[i + 2];
    i += 4;
    for (let k = 0; k < count; k++) prefix.push(ch);
  }

  let suffixCount = 0;
  let suffixChar = 0x2e;
  if (buf.length >= 4 && buf[buf.length - 3] === 0x80 && buf[buf.length - 4] === 0x00) {
    suffixCount = buf[buf.length - 2];
    suffixChar = buf[buf.length - 1];
  }

  const middleStart = i;
  const middleEnd = Math.max(middleStart, buf.length - 4);
  const template: number[] = [];
  for (let p = middleStart; p < middleEnd; p++) {
    const b = buf[p];
    if (b === 0x00) break;
    if (b === 0x69) continue;
    if (b >= 0x20 && b <= 0x7a) template.push(b);
  }

  const out = [...prefix];
  const middleTarget = Math.max(0, size - prefix.length - suffixCount);

  if (template.length > 0 && middleTarget > 0) {
    while (out.length < prefix.length + middleTarget) {
      for (const ch of template) {
        if (out.length >= prefix.length + middleTarget) break;
        out.push(ch);
      }
    }
  } else {
    for (let p = middleStart; p < middleEnd && out.length < prefix.length + middleTarget; p++) {
      const b = buf[p];
      if (b === 0x69 || b === 0x00) continue;
      if (b >= 0x20 && b <= 0x7a) out.push(b);
    }
  }

  for (let k = 0; k < suffixCount; k++) out.push(suffixChar);
  while (out.length < size) out.push(0x2e);
  return String.fromCharCode(...out.slice(0, size));
}

export function decodePackedMeshData(payload: string, size: number) {
  const buf = Buffer.from(String(payload ?? '').replace(/\s/g, ''), 'base64');
  if (!buf.length) return '.'.repeat(size);
  if (buf.length <= 6) return decodePackedUniform(buf, size);

  const variant = buf[3];
  if (variant === 0x5a) return decodePackedPairRle(buf, size);
  if (variant === 0x56) return decodePackedSingleRle(buf, size);

  return decodePackedPairRle(buf, size);
}

export function decodeMeshPayload(payload: string, packedMode: number, size: number) {
  if (packedMode === 0) {
    const text = sanitizeMeshString(String(payload ?? ''));
    return text.length >= size ? text.slice(0, size) : text.padEnd(size, '.');
  }
  return sanitizeMeshString(decodePackedMeshData(payload, size));
}

export function parseWktFileText(text: string): WktRow[] {
  const rows: WktRow[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (!line) continue;

    const head = line.match(/^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(S\d+)\s+(.*)$/);
    if (!head) continue;

    const arrow = head[6].match(/^[-\s]*([<>])\s*(.*)$/);
    if (!arrow) continue;

    rows.push({
      line: Number(head[1]),
      course: Number(head[3]),
      width: Number(head[4]),
      system: head[5],
      direction: arrow[1],
      mesh: sanitizeMeshString(arrow[2] ?? ''),
    });
  }

  return rows;
}

export function readWktFile(filePath: string): WktMeshResult {
  if (!fs.existsSync(filePath)) {
    return { ok: false, source: null, width: null, rows: [], error: 'Arquivo .wkt não encontrado.' };
  }

  const rows = parseWktFileText(fs.readFileSync(filePath, 'utf8'));
  const width = rows.reduce((max, row) => Math.max(max, row.mesh.length, row.width), 0);

  return {
    ok: rows.length > 0,
    source: 'wkt-file',
    path: filePath,
    width,
    rows,
  };
}

function parseSimxWktRows(
  simxText: string,
  opts?: { maxRows?: number; knittingWidth?: number | null }
): WktMeshResult {
  const maxRows = opts?.maxRows ?? 400;
  const rows: WktRow[] = [];
  let width: number | null = null;

  const strokeRe = /<simStroke id="\d+">([\s\S]*?)<\/simStroke>/gi;
  for (const stroke of simxText.matchAll(strokeRe)) {
    const block = stroke[1];
    const left = Number(block.match(/<counter id="#L">(\d+)<\/counter>/)?.[1] ?? 0);
    const right = Number(block.match(/<counter id="#R">(\d+)<\/counter>/)?.[1] ?? 0);
    const strokeWidth = right >= left ? right - left + 1 : 0;

    for (const line of block.matchAll(/<simLine id="(\d+)">([\s\S]*?)<\/simLine>/gi)) {
      const body = line[2];
      const wktMatch = body.match(/<wktData packedMode="(\d+)" size="(\d+)">([^<]*)<\/wktData>/);
      if (!wktMatch) continue;

      const packedMode = Number(wktMatch[1]);
      const size = Number(wktMatch[2]);
      const mesh = decodeMeshPayload(wktMatch[3], packedMode, size);
      if (!mesh.trim() || !mesh.replace(/[.\s]/g, '')) continue;

      width = width ?? strokeWidth ?? size;
      rows.push({
        line: Number(line[1]),
        course: rows.length,
        width: strokeWidth || size,
        system: body.match(/<knitSystem>([^<]+)<\/knitSystem>/)?.[1]?.trim() ?? '',
        direction: block.match(/<strokeDirection>([^<]+)<\/strokeDirection>/)?.[1]?.trim() ?? '',
        mesh,
      });

      if (rows.length >= maxRows * 3) break;
    }
    if (rows.length >= maxRows * 3) break;
  }

  const filtered = filterSimxRowsByStrokeWidth(rows, opts?.knittingWidth ?? null).slice(0, maxRows);

  return {
    ok: filtered.length > 0,
    source: filtered.length > 0 ? 'simx' : null,
    width: filtered[0]?.width ?? width,
    rows: filtered,
  };
}

export function readWktForPartFiles(input: {
  partBase: string;
  tmpDir: string;
  simxPath?: string;
  wktPath?: string;
  maxRows?: number;
  knittingWidth?: number | null;
}): WktMeshResult {
  if (input.simxPath && fs.existsSync(input.simxPath)) {
    const fromSimx = parseSimxWktRows(fs.readFileSync(input.simxPath, 'utf8'), {
      maxRows: input.maxRows ?? 400,
      knittingWidth: input.knittingWidth ?? null,
    });
    if (fromSimx.ok) {
      return { ...fromSimx, path: input.simxPath };
    }
  }

  const exactCandidates = [input.wktPath, input.wktPath ? undefined : null]
    .filter(Boolean)
    .map(String);

  for (const full of exactCandidates) {
    if (fs.existsSync(full)) {
      const fromFile = readWktFile(full);
      if (fromFile.ok) return fromFile;
    }
  }

  return { ok: false, source: null, width: null, rows: [], error: 'Malha não encontrada (.simx ou .wkt exato).' };
}
