import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readM1Knowledge, writeM1Knowledge, type M1StitchType } from './m1-knowledge';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const m1VisualStitchesDir = path.join(__dirname, '..', 'data', 'm1-visual', 'stitches');

export type M1VisualSlot = 'stitch' | 'icon' | 'malhas';

export type M1StitchVisual = {
  stitch?: string;
  icon?: string;
  malhas?: string;
};

export type M1StitchTypeWithVisual = M1StitchType & {
  visual?: M1StitchVisual;
};

const SLOT_LABELS: Record<M1VisualSlot, string> = {
  stitch: 'Foto do ponto',
  icon: 'Ícone programação',
  malhas: 'Tela Malhas (M1)',
};

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/x-ms-bmp': '.bmp',
};

export function m1VisualSlotLabel(slot: M1VisualSlot) {
  return SLOT_LABELS[slot];
}

export function m1VisualFileName(stitchId: string, slot: M1VisualSlot, ext: string) {
  return `${stitchId}-${slot}${ext}`;
}

export function m1VisualPublicUrl(stitchId: string, slot: M1VisualSlot) {
  return `/api/programs/m1-visual/file?stitch=${encodeURIComponent(stitchId)}&slot=${slot}`;
}

function ensureVisualDir() {
  fs.mkdirSync(m1VisualStitchesDir, { recursive: true });
}

function safeStitchId(raw: string) {
  const id = raw.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,48}$/.test(id)) {
    throw new Error('Id do ponto inválido (use letras, números e hífen).');
  }
  return id;
}

function safeSlot(raw: string): M1VisualSlot {
  if (raw === 'stitch' || raw === 'icon' || raw === 'malhas') return raw;
  throw new Error('Slot inválido. Use stitch, icon ou malhas.');
}

function extFromFileName(name: string) {
  const ext = path.extname(name).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.bmp'].includes(ext)) {
    throw new Error('Formato não suportado. Use PNG, JPG, BMP, WEBP, GIF ou SVG.');
  }
  return ext === '.jpeg' ? '.jpg' : ext;
}

function extFromMime(mime: string | undefined, fileName: string) {
  if (mime && EXT_BY_MIME[mime]) return EXT_BY_MIME[mime];
  return extFromFileName(fileName);
}

export function resolveM1VisualFile(stitchId: string, slot: M1VisualSlot) {
  const id = safeStitchId(stitchId);
  const s = safeSlot(slot);
  ensureVisualDir();

  const prefix = `${id}-${s}.`;
  const hit = fs.readdirSync(m1VisualStitchesDir).find((name) => name.startsWith(prefix));
  if (!hit) return null;

  const full = path.join(m1VisualStitchesDir, hit);
  return { full, name: hit, mime: mimeFromExt(path.extname(hit)) };
}

function mimeFromExt(ext: string) {
  switch (ext.toLowerCase()) {
    case '.png':
      return 'image/png';
    case '.jpg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.svg':
      return 'image/svg+xml';
    case '.bmp':
      return 'image/bmp';
    default:
      return 'application/octet-stream';
  }
}

function removeExistingVisual(stitchId: string, slot: M1VisualSlot) {
  ensureVisualDir();
  const prefix = `${stitchId}-${slot}.`;
  for (const name of fs.readdirSync(m1VisualStitchesDir)) {
    if (name.startsWith(prefix)) {
      fs.unlinkSync(path.join(m1VisualStitchesDir, name));
    }
  }
}

function attachVisualToStitchType(stitchId: string, slot: M1VisualSlot, fileName: string) {
  const lib = readM1Knowledge();
  const idx = lib.stitchTypes.findIndex((row) => row.id === stitchId);
  if (idx < 0) throw new Error('Tipo de ponto não encontrado.');

  const current = lib.stitchTypes[idx] as M1StitchTypeWithVisual;
  const visual = { ...(current.visual ?? {}), [slot]: fileName };
  lib.stitchTypes[idx] = { ...current, visual };
  writeM1Knowledge(lib);
  return lib.stitchTypes[idx] as M1StitchTypeWithVisual;
}

export function upsertM1StitchType(input: { id: string; code: string; name: string }) {
  const id = safeStitchId(input.id);
  const code = String(input.code ?? '').trim();
  const name = String(input.name ?? '').trim();
  if (!code || !name) throw new Error('Informe código e nome do ponto.');

  const lib = readM1Knowledge();
  const idx = lib.stitchTypes.findIndex((row) => row.id === id);
  if (idx >= 0) {
    lib.stitchTypes[idx] = { ...lib.stitchTypes[idx], code, name };
  } else {
    lib.stitchTypes.push({ id, code, name });
  }
  writeM1Knowledge(lib);
  return lib.stitchTypes.find((row) => row.id === id)!;
}

export function saveM1VisualBuffer(input: {
  stitchId: string;
  slot: string;
  fileName: string;
  buffer: Buffer;
  mimeType?: string;
}) {
  const stitchId = safeStitchId(input.stitchId);
  const slot = safeSlot(input.slot);
  const fileName = String(input.fileName ?? '').trim() || `${slot}.png`;
  const buffer = input.buffer;
  if (!buffer?.length) throw new Error('Arquivo vazio.');
  if (buffer.length > 12 * 1024 * 1024) throw new Error('Arquivo maior que 12 MB.');

  const ext = extFromMime(input.mimeType, fileName);
  ensureVisualDir();
  removeExistingVisual(stitchId, slot);

  const storedName = m1VisualFileName(stitchId, slot, ext);
  fs.writeFileSync(path.join(m1VisualStitchesDir, storedName), buffer);
  return attachVisualToStitchType(stitchId, slot, storedName);
}

/** @deprecated Preferir saveM1VisualBuffer (upload binário). */
export function saveM1VisualUpload(input: {
  stitchId: string;
  slot: string;
  fileName: string;
  dataBase64: string;
  mimeType?: string;
}) {
  const raw = String(input.dataBase64 ?? '').trim();
  if (!raw) throw new Error('Arquivo vazio.');
  const base64 = raw.includes(',') ? raw.split(',').pop()! : raw;
  const buffer = Buffer.from(base64, 'base64');
  return saveM1VisualBuffer({
    stitchId: input.stitchId,
    slot: input.slot,
    fileName: input.fileName,
    buffer,
    mimeType: input.mimeType,
  });
}

export function stitchTypesWithVisualUrls() {
  const lib = readM1Knowledge();
  return lib.stitchTypes.map((row) => {
    const typed = row as M1StitchTypeWithVisual;
    const visual: M1StitchVisual = {};
    for (const slot of ['stitch', 'icon', 'malhas'] as const) {
      if (resolveM1VisualFile(row.id, slot)) {
        visual[slot] = m1VisualPublicUrl(row.id, slot);
      }
    }
    return { ...typed, visual: Object.keys(visual).length > 0 ? visual : typed.visual };
  });
}
