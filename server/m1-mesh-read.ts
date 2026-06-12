import fs from 'node:fs';
import path from 'node:path';

import { buildMeshPreviewRows, filterSimxRowsByStrokeWidth } from './mesh-preview';
import { yarnMapFromGuides } from './fabric-tint';
import { parseKnittingWidthFromSin } from './sin-knitting-width';
import { parseYarnGuidesFromSin } from './sin-yarn';
import { partBaseFromFileName, readSinText } from './sin-read';
import { resolveStollPartFiles } from './stoll-time';
import { readWktForPartFiles, type WktMeshResult } from './wkt-read';

export type M1MeshPartResult = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  error?: string;
  source?: WktMeshResult['source'];
  width?: number | null;
  row_count?: number;
  preview_rows?: number;
  display_width?: number;
  rows?: WktMeshResult['rows'];
  yarns?: { letter: string; color: string; description?: string }[];
  files?: {
    wkt?: string;
    simx?: string;
    sin?: string;
  };
};

function findExactWkt(tmpDir: string, modelFolder: string | undefined, partBase: string) {
  const candidates: string[] = [];
  if (modelFolder) {
    candidates.push(path.join(modelFolder, 'dados do programa', partBase, `${partBase}.wkt`));
    candidates.push(path.join(modelFolder, `${partBase}.wkt`));
  }
  if (fs.existsSync(tmpDir)) {
    candidates.push(path.join(tmpDir, `${partBase}.wkt`));
  }

  for (const full of candidates) {
    if (fs.existsSync(full)) return full;
  }
  return undefined;
}

function readYarnColors(sinPath: string | undefined, modelFolder: string, partBase: string) {
  try {
    let text = '';
    if (sinPath && fs.existsSync(sinPath)) {
      text = fs.readFileSync(sinPath, 'utf8');
    } else {
      const fromModel = readSinText(modelFolder, partBase);
      text = fromModel.text ?? '';
    }
    if (!text) return [];
    const parsed = parseYarnGuidesFromSin(text);
    const map = yarnMapFromGuides(parsed.guides);
    return parsed.guides.map((guide) => ({
      letter: guide.letter,
      color: map[guide.letter.toUpperCase()] ?? '#234e82',
      description: guide.description,
    }));
  } catch {
    return [];
  }
}

function readKnittingWidth(sinPath: string | undefined, modelFolder: string, partBase: string) {
  try {
    if (sinPath && fs.existsSync(sinPath)) {
      return parseKnittingWidthFromSin(fs.readFileSync(sinPath, 'utf8')).wales;
    }
    const fromModel = readSinText(modelFolder, partBase);
    if (fromModel.text) return parseKnittingWidthFromSin(fromModel.text).wales;
  } catch {
    // ignore
  }
  return null;
}

export function readM1MeshForPart(
  tmpDir: string,
  modelFolder: string,
  part: { label: string; file_name: string }
): M1MeshPartResult {
  const partBase = partBaseFromFileName(part.file_name);
  if (!partBase) {
    return {
      label: part.label,
      file_name: part.file_name,
      part_base: '',
      ok: false,
      error: 'Arquivo da parte inválido.',
    };
  }

  const resolved = resolveStollPartFiles(tmpDir, modelFolder, partBase);
  const wktPath = findExactWkt(tmpDir, modelFolder, partBase);
  const knittingWidth = readKnittingWidth(resolved.sin, modelFolder, partBase);
  const yarns = readYarnColors(resolved.sin, modelFolder, partBase);

  const mesh = readWktForPartFiles({
    partBase,
    tmpDir,
    simxPath: resolved.simx,
    wktPath,
    knittingWidth,
    maxRows: 400,
  });

  if (!mesh.ok) {
    return {
      label: part.label,
      file_name: part.file_name,
      part_base: partBase,
      ok: false,
      error: mesh.error ?? 'Malha não encontrada para esta parte.',
      files: {
        wkt: wktPath,
        simx: resolved.simx,
        sin: resolved.sin,
      },
    };
  }

  const preview = buildMeshPreviewRows(mesh.rows, { knittingWidth, maxRows: 40, maxDisplayWidth: 72 });

  if (!preview.rows.length) {
    return {
      label: part.label,
      file_name: part.file_name,
      part_base: partBase,
      ok: false,
      error: 'Malha sem padrão legível (somente linhas vazias).',
      files: {
        wkt: wktPath ?? mesh.path,
        simx: resolved.simx,
        sin: resolved.sin,
      },
    };
  }

  return {
    label: part.label,
    file_name: part.file_name,
    part_base: partBase,
    ok: true,
    source: mesh.source,
    width: preview.meta.displayWidth,
    row_count: mesh.rows.length,
    preview_rows: preview.meta.displayRows,
    display_width: preview.meta.displayWidth,
    rows: preview.rows,
    yarns,
    files: {
      wkt: mesh.source === 'wkt-file' ? mesh.path : wktPath,
      simx: mesh.source === 'simx' ? mesh.path : resolved.simx,
      sin: resolved.sin,
    },
  };
}

export function readM1MeshForModel(
  tmpDir: string,
  modelFolder: string,
  parts: { label: string; file_name: string }[]
) {
  return parts.map((part) => readM1MeshForPart(tmpDir, modelFolder, part));
}

export { filterSimxRowsByStrokeWidth };
