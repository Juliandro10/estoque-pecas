import fs from 'node:fs';
import path from 'node:path';

import { clipSyntechText } from './syntech-db';
import { sintralPartDir } from './sintral-capture';

export function partBaseFromFileName(fileName: string) {
  return fileName.replace(/\.mdv$/i, '');
}

export function readSinText(modelFolder: string, partBase: string) {
  const partDir = sintralPartDir(modelFolder, partBase);
  const candidates = [
    path.join(partDir, `${partBase}.sin`),
    path.join(modelFolder, `${partBase}.sin`),
  ];

  for (const sinPath of candidates) {
    if (!fs.existsSync(sinPath)) continue;
    try {
      return { text: fs.readFileSync(sinPath, 'utf8'), part_base: partBase, sin_path: sinPath };
    } catch {
      continue;
    }
  }

  return null;
}

export function readSinTextsForModel(modelFolder: string, partFileNames: string[]) {
  const seen = new Set<string>();
  const rows: { text: string; part_base: string }[] = [];

  for (const fileName of partFileNames) {
    if (!/\.mdv$/i.test(fileName)) continue;
    const partBase = partBaseFromFileName(fileName);
    if (seen.has(partBase)) continue;
    seen.add(partBase);

    const sin = readSinText(modelFolder, partBase);
    if (sin) rows.push({ text: sin.text, part_base: sin.part_base });
  }

  return rows;
}

/** Token após CMS… na linha 1 (ex.: 5534-REGATA-LISTRA-CORPO). */
export function parseSinProgramToken(text: string) {
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const match = firstLine.match(/CMS\d+\+?\.(\S+)/i);
  return match?.[1] ?? null;
}

const PROGRAMA_MAX = 20;

/** Nome do programa no Syntech = pasta do modelo (ex.: 5534-REGATA-LISTRA). */
export function resolvePrograma(modelFolder?: string, sinText?: string) {
  if (modelFolder) {
    return clipSyntechText(path.basename(modelFolder), PROGRAMA_MAX);
  }

  const token = sinText ? parseSinProgramToken(sinText) : null;
  if (!token) return null;

  return clipSyntechText(token, PROGRAMA_MAX);
}
