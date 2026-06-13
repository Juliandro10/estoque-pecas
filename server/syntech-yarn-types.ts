import fs from 'node:fs';
import path from 'node:path';

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
