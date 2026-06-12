import fs from 'node:fs';

import path from 'node:path';

import { isIgnoredProgramSubfolder } from './program-folders';



export const DADOS_PROGRAMA_DIR = 'dados do programa';



export const SINTRAL_CAPTURE_BUILD = 'v20-m1-sin-simx';



export function fileMtimeMs(filePath: string) {

  try {

    return fs.statSync(filePath).mtimeMs;

  } catch {

    return 0;

  }

}



export function listDirFiles(dir: string) {

  try {

    return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile());

  } catch {

    return [];

  }

}



function refFromPartBase(partBase: string) {

  return partBase.match(/^(\d+)/)?.[1] ?? '';

}



function isDadosProgramaPath(dirPath: string) {

  const parts = dirPath.split(/[\\/]/);

  return parts.some((p) => p.toLowerCase() === DADOS_PROGRAMA_DIR.toLowerCase());

}



export function findModelFolderForPart(partBase: string, programsRoot: string) {

  const ref = refFromPartBase(partBase);

  if (!ref || !fs.existsSync(programsRoot)) return null;



  let best: { path: string; mtime: number } | null = null;



  function walk(dir: string) {

    let entries: fs.Dirent[];

    try {

      entries = fs.readdirSync(dir, { withFileTypes: true });

    } catch {

      return;

    }

    for (const entry of entries) {

      if (!entry.isDirectory()) continue;

      if (entry.name === DADOS_PROGRAMA_DIR) continue;
      if (isIgnoredProgramSubfolder(entry.name)) continue;

      const full = path.join(dir, entry.name);

      if (entry.name === ref || entry.name.startsWith(`${ref}-`)) {

        const candidate = path.join(full, `${partBase}.mdv`);

        if (fs.existsSync(candidate) && !isDadosProgramaPath(full)) {

          const mtime = fileMtimeMs(candidate);

          if (!best || mtime > best.mtime) best = { path: full, mtime };

        }

      }

      walk(full);

    }

  }



  walk(programsRoot);

  return best?.path ?? null;

}



export function sintralDataRoot(modelFolder: string) {

  return path.join(modelFolder, DADOS_PROGRAMA_DIR);

}



export function sintralPartDir(modelFolder: string, partBase: string) {

  return path.join(sintralDataRoot(modelFolder), partBase);

}



function assertPartDirDest(dest: string, partDir: string) {

  const resolvedDest = path.resolve(dest);

  const resolvedPartDir = path.resolve(partDir);

  if (!resolvedDest.startsWith(resolvedPartDir + path.sep)) {

    throw new Error(`Destino fora de dados do programa: ${resolvedDest}`);

  }

}



export function copyPartDataFile(src: string, modelFolder: string, partBase: string, destName: string) {

  if (!partBase.trim() || !fs.existsSync(src)) return false;



  const partDir = sintralPartDir(modelFolder, partBase);

  const dest = path.join(partDir, destName);

  assertPartDirDest(dest, partDir);



  fs.mkdirSync(partDir, { recursive: true });

  fs.copyFileSync(src, dest);

  fs.utimesSync(dest, new Date(), new Date(fileMtimeMs(src)));

  return true;

}



export function writePartManifest(partDir: string, fileName: string, payload: Record<string, unknown>) {

  fs.writeFileSync(path.join(partDir, fileName), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');

}



const MANIFEST_NAMES = new Set(['ultimo-processo.json', 'ultimo-sin.json', 'ultimo-cheque.json']);



export function listSintralDados(modelFolder: string) {

  const root = sintralDataRoot(modelFolder);

  if (!fs.existsSync(root)) {

    return { root, parts: [] as { part_base: string; files: string[]; manifest?: Record<string, unknown> }[] };

  }



  const parts: { part_base: string; files: string[]; manifest?: Record<string, unknown> }[] = [];



  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {

    if (!entry.isDirectory()) continue;

    if (entry.name === 'historico') continue;



    const partDir = path.join(root, entry.name);

    const files = listDirFiles(partDir)

      .map((f) => f.name)

      .filter((name) => !MANIFEST_NAMES.has(name) && name !== 'historico');



    let manifest: Record<string, unknown> | undefined;

    for (const manifestName of ['ultimo-processo.json', 'ultimo-sin.json', 'ultimo-cheque.json']) {

      const manifestPath = path.join(partDir, manifestName);

      if (!fs.existsSync(manifestPath)) continue;

      try {

        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;

        break;

      } catch {

        // ignore

      }

    }



    parts.push({ part_base: entry.name, files, manifest });

  }



  return { root, parts };

}


