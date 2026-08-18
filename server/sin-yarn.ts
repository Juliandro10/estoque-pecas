import fs from 'node:fs';
import path from 'node:path';

import { pctByLetterFromSimx } from './simx-yarn';
import { sintralPartDir } from './sintral-capture';
import { dedupePhantomIColors, stripPhantomColorI } from '../shared/syntech-name-match';
import { readSyntechYarnCatalog } from './syntech-yarn-catalog';

let cachedCatalogColors: string[] | null = null;

function catalogColorsForRepair(): string[] {
  if (!cachedCatalogColors) {
    cachedCatalogColors = dedupePhantomIColors(
      readSyntechYarnCatalog().types.flatMap((item) => item.cores)
    );
  }
  return cachedCatalogColors;
}

function repairSinGuideDescription(description: string): string {
  let text = description.trim();
  if (!text) return text;

  text = text.replace(/\sI$/i, '').trim();
  text = text.replace(/(\d+\s+)CABOSI\b/gi, '$1CABOS');

  const caboMatch = text.match(/(\d+)\s+CABO(?:S(?:I)?)?\b/i);
  if (caboMatch && caboMatch.index !== undefined) {
    const end = caboMatch.index + caboMatch[0].length;
    const colorPart = text.slice(end).trim();
    if (colorPart) {
      const fixed = stripPhantomColorI(colorPart, catalogColorsForRepair());
      if (fixed !== colorPart) {
        text = `${text.slice(0, end).trim()} ${fixed}`.trim();
      }
    }
  }

  return text;
}

export type SinYarnGuide = {
  guide: number;
  letter: string;
  description: string;
  side: 'left' | 'right';
  pct?: number;
};

export type SinYarnParseResult = {
  ygc?: string;
  ydf?: number;
  guides: SinYarnGuide[];
};

export type SinYarnPartRow = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  sin_file?: string;
  simx_file?: string;
  ygc?: string;
  ydf?: number;
  guides: SinYarnGuide[];
  simx_ok?: boolean;
  error?: string;
  simx_error?: string;
};

function extractSinColumns(rest: string): { left: string; right: string } {
  let body = rest.trim().replace(/\sI\s*$/i, '');

  if (/^I\s/i.test(body)) {
    return { left: '', right: body.replace(/^I\s*/i, '').trim() };
  }

  const parts = body.split(/\sI\s/i).map((part) => part.trim());
  return { left: parts[0] ?? '', right: parts[1] ?? '' };
}

function parseTableLine(line: string): { left: string; right: string } | null {
  const prefix = line.match(/^\s*\d+\s+C\s+/i);
  if (!prefix) return null;

  return extractSinColumns(line.slice(prefix[0].length));
}

function isYarnTableBorder(line: string) {
  return /^\s*\d+\s+C\s+-{10,}I/i.test(line);
}

function parseGuideCell(cell: string, side: 'left' | 'right'): SinYarnGuide | null {
  const trimmed = cell.trim();
  if (!trimmed || /^-+$/.test(trimmed)) return null;

  const match = trimmed.match(/^(\d+)=(\S)(?:\s+(.*))?$/);
  if (!match) return null;

  return {
    guide: Number(match[1]),
    letter: match[2],
    description: repairSinGuideDescription(match[3] ?? ''),
    side,
  };
}

export function parseYarnGuidesFromSin(text: string): SinYarnParseResult {
  const lines = text.split(/\r?\n/);
  let ygc: string | undefined;
  let ydf: number | undefined;
  const guides: SinYarnGuide[] = [];
  let inTable = false;
  let sawHeader = false;

  for (const line of lines) {
    if (/^\s*\d+\s+YGC:/i.test(line)) {
      ygc = line.replace(/^\s*\d+\s+/, '').trim();
      continue;
    }

    if (/^\s*\d+\s+YDF=/i.test(line)) {
      ydf = Number(line.match(/YDF=(\d+)/i)?.[1]);
      continue;
    }

    if (/^\s*\d+\s+C\s+LEFT\s+I\s+RIGHT/i.test(line)) {
      inTable = true;
      sawHeader = true;
      continue;
    }

    if (!inTable || !sawHeader) continue;

    if (isYarnTableBorder(line)) {
      if (guides.length > 0) break;
      continue;
    }

    const row = parseTableLine(line);
    if (!row) continue;

    const left = parseGuideCell(row.left, 'left');
    if (left) guides.push(left);

    const right = parseGuideCell(row.right, 'right');
    if (right) guides.push(right);
  }

  return { ygc, ydf, guides };
}

function partBaseFromFileName(fileName: string) {
  return fileName.replace(/\.mdv$/i, '');
}

function readSinFromPartDir(modelFolder: string, partBase: string) {
  const partDir = sintralPartDir(modelFolder, partBase);
  const primary = path.join(partDir, `${partBase}.sin`);
  if (fs.existsSync(primary)) return primary;

  try {
    const entries = fs.readdirSync(partDir, { withFileTypes: true });
    const match = entries.find((entry) => entry.isFile() && entry.name.toLowerCase() === `${partBase}.sin`.toLowerCase());
    if (match) return path.join(partDir, match.name);
  } catch {
    return null;
  }

  return null;
}

function readSimxFromPartDir(modelFolder: string, partBase: string) {
  const partDir = sintralPartDir(modelFolder, partBase);
  const primary = path.join(partDir, `${partBase}.simx`);
  if (fs.existsSync(primary)) return primary;

  const modelRoot = path.join(modelFolder, `${partBase}.simx`);
  if (fs.existsSync(modelRoot)) return modelRoot;

  try {
    const entries = fs.readdirSync(partDir, { withFileTypes: true });
    const match = entries.find(
      (entry) => entry.isFile() && entry.name.toLowerCase() === `${partBase}.simx`.toLowerCase()
    );
    if (match) return path.join(partDir, match.name);
  } catch {
    return null;
  }

  return null;
}

export function readSinYarnForPart(modelFolder: string, partBase: string): Omit<SinYarnPartRow, 'label' | 'file_name'> {
  const sinPath = readSinFromPartDir(modelFolder, partBase);
  if (!sinPath) {
    return {
      part_base: partBase,
      ok: false,
      guides: [],
      error: 'Sem .sin em dados do programa',
    };
  }

  try {
    const text = fs.readFileSync(sinPath, 'utf8');
    const parsed = parseYarnGuidesFromSin(text);
    const guides = [...parsed.guides];

    let simx_file: string | undefined;
    let simx_ok = false;
    let simx_error: string | undefined;

    const simxPath = readSimxFromPartDir(modelFolder, partBase);
    if (simxPath) {
      try {
        const pctMap = pctByLetterFromSimx(fs.readFileSync(simxPath, 'utf8'));
        for (const guide of guides) {
          const pct = pctMap.get(guide.letter.toUpperCase());
          if (pct !== undefined) guide.pct = Math.round(pct * 100) / 100;
        }
        simx_file = path.basename(simxPath);
        simx_ok = pctMap.size > 0;
        if (!simx_ok) simx_error = 'Simx sem yarnCarrier';
      } catch (err) {
        simx_error = err instanceof Error ? err.message : 'Erro ao ler .simx';
      }
    } else {
      simx_error = 'Sem .simx — processe a parte no M1';
    }

    return {
      part_base: partBase,
      ok: guides.length > 0,
      sin_file: path.basename(sinPath),
      simx_file,
      ygc: parsed.ygc,
      ydf: parsed.ydf,
      guides,
      simx_ok,
      error: guides.length > 0 ? undefined : 'Tabela de guias não encontrada no .sin',
      simx_error,
    };
  } catch (err) {
    return {
      part_base: partBase,
      ok: false,
      guides: [],
      error: err instanceof Error ? err.message : 'Erro ao ler .sin',
    };
  }
}

export function readSinYarnsForModel(
  modelFolder: string,
  partRows: { label: string; file_name: string }[]
): SinYarnPartRow[] {
  return partRows.map((part) => {
    const partBase = partBaseFromFileName(part.file_name);
    const row = readSinYarnForPart(modelFolder, partBase);
    return {
      label: part.label,
      file_name: part.file_name,
      ...row,
    };
  });
}
