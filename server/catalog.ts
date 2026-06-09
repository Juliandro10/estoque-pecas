import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const catalogPath = path.join(__dirname, '..', 'data', 'catalogo.json');

type CatalogPart = {
  code: string;
  name: string;
  quantity?: number;
  min_quantity?: number;
  unit?: string;
};

type CatalogFile = { parts?: CatalogPart[] };

export function readCatalogFile(filePath = catalogPath): CatalogFile {
  if (!fs.existsSync(filePath)) return { parts: [] };
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogFile;
}

export function importCatalog(options?: { preserveQuantity?: boolean }) {
  const preserveQuantity = options?.preserveQuantity ?? true;
  const parts = readCatalogFile().parts ?? [];
  let added = 0;
  let updated = 0;

  for (const item of parts) {
    const code = item.code?.trim();
    const name = item.name?.trim();
    if (!code || !name) continue;

    const existing = store.getParts().find((p) => p.code === code);
    const result = store.upsertPartFromCatalog({
      code,
      name,
      min_quantity: item.min_quantity,
      unit: item.unit,
      quantity: preserveQuantity && existing ? existing.quantity : Number(item.quantity ?? 0),
    });
    if (result.created) added += 1;
    else updated += 1;
  }

  return { added, updated, total: parts.length };
}
