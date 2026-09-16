import fs from 'node:fs';
import path from 'node:path';

import { DADOS_PROGRAMA_DIR } from './sintral-capture';
import { isIgnoredProgramSubfolder } from './program-folders';
import { getProgramsRoots } from './programs-roots';
import { cadastroPdfFileName } from '../shared/cadastro-pdf';
import { patchFirestoreJson } from '../painel-tecelagem/publish-firebase.ts';

const PDF_RX = /\.pdf$/i;
const MAX_NUVEM_BYTES = 650_000;

export type CadastroPdfHit = {
  reference: string;
  path: string;
  file_name: string;
  bytes: number;
};

function refCandidates(reference: string) {
  const text = reference.trim();
  const out: string[] = [];
  const add = (value: string) => {
    const item = value.trim();
    if (item && !out.includes(item)) out.push(item);
  };
  add(text);
  const numeric = text.match(/^(\d{3,6})\b/);
  if (numeric) add(numeric[1]);
  add(text.split(/[-_\s./]/)[0] ?? '');
  return out;
}

function scorePdfName(fileName: string, refs: string[]) {
  const lower = fileName.toLowerCase();
  for (const ref of refs) {
    const needle = ref.toLowerCase();
    if (lower === `cadastro-${needle}.pdf`) return 100;
    if (lower === `${needle}.pdf`) return 90;
    if (lower.includes(`cadastro-${needle}`)) return 80;
  }
  if (/ficha/.test(lower) && /custo/.test(lower)) return 55;
  if (/cadastro/.test(lower)) return 40;
  if (/custo/.test(lower)) return 25;
  return 0;
}

function listPdfFiles(dir: string) {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && PDF_RX.test(entry.name))
      .map((entry) => path.join(dir, entry.name));
  } catch {
    return [];
  }
}

function collectDirs(modelFolder: string) {
  const dirs = [modelFolder, path.join(modelFolder, DADOS_PROGRAMA_DIR)];
  const dados = path.join(modelFolder, DADOS_PROGRAMA_DIR);
  try {
    for (const entry of fs.readdirSync(dados, { withFileTypes: true })) {
      if (entry.isDirectory() && !isIgnoredProgramSubfolder(entry.name)) {
        dirs.push(path.join(dados, entry.name));
      }
    }
  } catch {
    /* pasta dados pode não existir */
  }
  return dirs;
}

export function findCadastroPdfInFolder(modelFolder: string, reference: string): CadastroPdfHit | null {
  const refs = refCandidates(reference);
  const hits: { file: string; score: number; mtime: number }[] = [];

  for (const ref of refs) {
    const exact = path.join(modelFolder, DADOS_PROGRAMA_DIR, cadastroPdfFileName(ref));
    if (fs.existsSync(exact)) {
      return {
        reference: refs[1] ?? refs[0] ?? reference.trim(),
        path: exact,
        file_name: path.basename(exact),
        bytes: fs.statSync(exact).size,
      };
    }
  }

  for (const dir of collectDirs(modelFolder)) {
    for (const file of listPdfFiles(dir)) {
      const score = scorePdfName(path.basename(file), refs);
      if (score <= 0) continue;
      hits.push({ file, score, mtime: fs.statSync(file).mtimeMs });
    }
  }

  hits.sort((a, b) => b.score - a.score || b.mtime - a.mtime);
  const best = hits[0];
  if (!best) return null;
  return {
    reference: refs.find((item) => /^\d{3,6}$/.test(item)) ?? refs[0] ?? reference.trim(),
    path: best.file,
    file_name: path.basename(best.file),
    bytes: fs.statSync(best.file).size,
  };
}

function refFromPdf(fileName: string, folderName: string) {
  const base = fileName.replace(/\.pdf$/i, '');
  const fromCadastro = base.match(/^cadastro-(.+)$/i);
  const raw = fromCadastro?.[1] ?? folderName;
  const numeric = raw.match(/^(\d{3,6})\b/);
  return (numeric?.[1] ?? raw).trim();
}

function collectFromDados(dadosDir: string, folderName: string, out: CadastroPdfHit[]) {
  const seen = new Set(out.map((item) => item.path.toLowerCase()));
  const files = [
    ...listPdfFiles(dadosDir),
    ...listPdfFiles(path.dirname(dadosDir)),
  ];
  try {
    for (const entry of fs.readdirSync(dadosDir, { withFileTypes: true })) {
      if (entry.isDirectory() && !isIgnoredProgramSubfolder(entry.name)) {
        files.push(...listPdfFiles(path.join(dadosDir, entry.name)));
      }
    }
  } catch {
    /* ignore */
  }

  const ranked = files
    .map((file) => ({
      file,
      score: scorePdfName(path.basename(file), refCandidates(folderName)),
      mtime: fs.statSync(file).mtimeMs,
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || b.mtime - a.mtime);

  const best = ranked[0];
  if (!best || seen.has(best.file.toLowerCase())) return;
  out.push({
    reference: refFromPdf(path.basename(best.file), folderName),
    path: best.file,
    file_name: path.basename(best.file),
    bytes: fs.statSync(best.file).size,
  });
}

export function listCadastroPdfsOnDisk(): CadastroPdfHit[] {
  const out: CadastroPdfHit[] = [];

  function walk(dir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const dados = entries.find(
      (entry) => entry.isDirectory() && entry.name.toLowerCase() === DADOS_PROGRAMA_DIR.toLowerCase()
    );
    if (dados) {
      collectFromDados(path.join(dir, dados.name), path.basename(dir), out);
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || isIgnoredProgramSubfolder(entry.name)) continue;
      walk(path.join(dir, entry.name));
    }
  }

  for (const root of getProgramsRoots()) walk(root);
  return out;
}

export async function publishCadastroPdfToNuvem(hit: CadastroPdfHit) {
  if (hit.bytes <= 0 || hit.bytes > MAX_NUVEM_BYTES) return false;
  const pdf_base64 = fs.readFileSync(hit.path).toString('base64');
  const reference = hit.reference.trim();
  if (!reference) return false;
  return patchFirestoreJson('cadastro_custo_pdf', reference, {
    type: 'pdf',
    reference,
    file_name: hit.file_name,
    pdf_base64,
  });
}

let importStarted = false;

export function startCadastroPdfImportOnce() {
  if (importStarted) return;
  importStarted = true;
  void importCadastroPdfsToNuvem().catch((err) => {
    console.warn('Cópia das fichas de custo:', err instanceof Error ? err.message : err);
  });
}

export async function importCadastroPdfsToNuvem() {
  const hits = listCadastroPdfsOnDisk();
  let copied = 0;
  const seen = new Set<string>();
  for (const hit of hits) {
    const key = hit.reference.toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try {
      if (await publishCadastroPdfToNuvem(hit)) copied += 1;
    } catch (err) {
      console.warn(`Ficha ${hit.reference}:`, err instanceof Error ? err.message : err);
    }
  }
  console.log(`Fichas de custo copiadas para o navegador: ${copied}/${seen.size}`);
  return { found: hits.length, copied };
}
