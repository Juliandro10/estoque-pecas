import fs from 'node:fs';
import path from 'node:path';

import { findBestYarnTypeMatch } from '../shared/syntech-name-match';
import { parseYarnDescription } from '../shared/yarn-description-parse';
import { readSyntechYarnCatalog } from './syntech-yarn-catalog';

let cachedYarnTypes: string[] | null = null;

export function yarnTypesFromCatalog() {
  if (cachedYarnTypes) return cachedYarnTypes;
  const file = path.join(process.cwd(), 'data', 'syntech-fios.json');
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8')) as { types: { tipo: string }[] };
    cachedYarnTypes = data.types.map((item) => item.tipo);
  } catch {
    cachedYarnTypes = [];
  }
  return cachedYarnTypes;
}

export function resolveTipoFioCodigoFromCatalog(text: string): number | null {
  const catalog = readSyntechYarnCatalog();
  const yarnTypes = catalog.types.map((item) => item.tipo);
  const trimmed = text.trim();
  if (!trimmed || yarnTypes.length === 0) return null;

  const parsed = parseYarnDescription(trimmed, yarnTypes);
  const candidates = [
    trimmed,
    parsed.tipo,
    `${parsed.tipo}${parsed.cor ? ` ${parsed.cor}` : ''}`.trim(),
  ].filter(Boolean);

  for (const candidate of candidates) {
    const matchName = findBestYarnTypeMatch(candidate, yarnTypes);
    if (!matchName) continue;
    const match = catalog.types.find((item) => item.tipo === matchName);
    if (match) return match.codigo;
  }

  return null;
}
