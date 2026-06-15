import fs from 'node:fs';
import path from 'node:path';

import { isIgnoredProgramSubfolder } from './program-folders';

export type ModelPartRow = {
  key: string;
  label: string;
  file_name: string;
};

function parseModelName(folderName: string, ref: string) {
  if (folderName === ref) return ref;
  if (folderName.startsWith(`${ref}-`)) return folderName.slice(ref.length + 1);
  return folderName;
}

function stripPartSuffix(baseName: string, folderName: string, ref: string) {
  const lower = baseName.toLowerCase();
  const prefixes = [`${folderName.toLowerCase()}-`, `${ref.toLowerCase()}-`];
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) {
      return baseName.slice(prefix.length);
    }
  }
  const modelName = parseModelName(folderName, ref);
  if (modelName !== ref && modelName !== folderName) {
    const modelPrefix = `${ref}-${modelName}-`.toLowerCase();
    if (lower.startsWith(modelPrefix)) {
      return baseName.slice(modelPrefix.length);
    }
  }
  return baseName;
}

export function stripPartLabelFromFile(
  fileName: string,
  folderName: string,
  ref: string
) {
  const baseName = fileName.replace(/\.mdv$/i, '');
  return stripPartSuffix(baseName, folderName, ref);
}

export function listModelParts(folderPath: string, folderName: string, ref: string): ModelPartRow[] {
  const map = new Map<string, ModelPartRow>();

  function scan(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (isIgnoredProgramSubfolder(entry.name)) continue;
        scan(full);
        continue;
      }
      if (!entry.isFile() || !/\.mdv$/i.test(entry.name)) continue;

      const label = stripPartSuffix(entry.name.replace(/\.mdv$/i, ''), folderName, ref);
      const key = label.toUpperCase();
      if (!map.has(key)) {
        map.set(key, { key, label, file_name: entry.name });
      }
    }
  }

  scan(folderPath);
  return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
}
