import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function addToPath(folder: string) {
  if (!folder || !fs.existsSync(folder)) return;
  const current = process.env.PATH ?? '';
  if (current.toLowerCase().includes(folder.toLowerCase())) return;
  process.env.PATH = `${folder};${current}`;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const candidates = [
  process.env.PAINEL_ROOT,
  process.cwd(),
  here,
  path.resolve(here, '..'),
].filter((value): value is string => Boolean(value));

for (const root of candidates) {
  if (fs.existsSync(path.join(root, 'fbclient.dll'))) addToPath(root);
  addToPath(path.join(root, 'tools', 'firebird-textil', 'bin64'));
}
