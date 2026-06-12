import fs from 'node:fs';
import path from 'node:path';

export type M1BitmapEntry = {
  id: string;
  file_name: string;
  label: string;
  url: string;
};

const DEFAULT_BITMAP_DIR =
  process.env.STOLL_M1_BITMAP ??
  'C:\\Program Files (x86)\\Stoll\\M1plus\\8.0.010\\Bitmap';

function labelFromFileName(fileName: string) {
  return fileName
    .replace(/\.bmp$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function idFromFileName(fileName: string) {
  return fileName
    .replace(/\.bmp$/i, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function resolveM1BitmapDir(customDir?: string) {
  const dir = customDir ?? DEFAULT_BITMAP_DIR;
  return fs.existsSync(dir) ? dir : null;
}

export function listM1BitmapCatalog(customDir?: string): {
  dir: string | null;
  ok: boolean;
  items: M1BitmapEntry[];
} {
  const dir = resolveM1BitmapDir(customDir);
  if (!dir) return { dir: null, ok: false, items: [] };

  const items = fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.bmp'))
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .map((file_name) => ({
      id: idFromFileName(file_name),
      file_name,
      label: labelFromFileName(file_name),
      url: `/api/programs/m1-bitmap/file?name=${encodeURIComponent(file_name)}`,
    }));

  return { dir, ok: items.length > 0, items };
}

export function resolveM1BitmapFile(name: string, customDir?: string) {
  const dir = resolveM1BitmapDir(customDir);
  if (!dir) return null;

  const safe = path.basename(name);
  if (!safe.toLowerCase().endsWith('.bmp')) return null;

  const full = path.join(dir, safe);
  if (!fs.existsSync(full)) return null;
  return { full, name: safe };
}

export function suggestBitmapForStitchCode(code: string, catalog = listM1BitmapCatalog()) {
  const needle = code.trim().toLowerCase();
  if (!needle || !catalog.items.length) return null;

  const exact = catalog.items.find((row) => row.id === idFromFileName(`${needle}.bmp`));
  if (exact) return exact;

  const partial = catalog.items.find(
    (row) => row.id.includes(needle) || row.label.toLowerCase().includes(needle)
  );
  return partial ?? null;
}
