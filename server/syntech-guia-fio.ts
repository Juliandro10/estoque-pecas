import fs from 'node:fs';
import path from 'node:path';

import type { SinYarnGuide } from './sin-yarn';
import { parseYarnGuidesFromSin } from './sin-yarn';
import { readSinTextsForModel } from './sin-read';
import {
  GUIA_COR_BICO_8,
  RESTO_FIO_NOME,
  resolveCaboForBico,
} from './syntech-bico-rules';
import { parseYarnDescription } from './yarn-description-parse';

const GUIA_SLOT_COUNT = 8;

export type GuiaFioRow = {
  numero: number;
  esquerda: string | null;
  cabo: string | null;
  direita: string | null;
  cabod: string | null;
  cor_do_fio: string | null;
};

let cachedYarnTypes: string[] | null = null;

function yarnTypesFromCatalog() {
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

function parseGuideDescription(description: string) {
  return parseYarnDescription(description, yarnTypesFromCatalog());
}

function guideToGuiaFields(guide: SinYarnGuide): Omit<GuiaFioRow, 'numero'> {
  const { tipo, cabo, cor } = parseGuideDescription(guide.description);
  const tipoText = tipo.slice(0, 40);
  const corText = cor ? cor.slice(0, 40) : null;

  if (guide.side === 'left') {
    return {
      esquerda: tipoText,
      cabo: cabo,
      direita: null,
      cabod: null,
      cor_do_fio: corText,
    };
  }

  return {
    esquerda: null,
    cabo: null,
    direita: tipoText,
    cabod: cabo,
    cor_do_fio: corText,
  };
}

function mergeSide(existing: string | null, incoming: string | null) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing.toUpperCase() === incoming.toUpperCase()) return existing;
  return incoming;
}

function mergeGuiaRow(existing: GuiaFioRow, incoming: GuiaFioRow) {
  return {
    numero: existing.numero,
    esquerda: mergeSide(existing.esquerda, incoming.esquerda),
    cabo: existing.cabo ?? incoming.cabo,
    direita: mergeSide(existing.direita, incoming.direita),
    cabod: existing.cabod ?? incoming.cabod,
    cor_do_fio: mergeSide(existing.cor_do_fio, incoming.cor_do_fio),
  };
}

function emptyGuiaRow(numero: number): GuiaFioRow {
  return {
    numero,
    esquerda: null,
    cabo: null,
    direita: null,
    cabod: null,
    cor_do_fio: null,
  };
}

function guiaRowFilled(row: GuiaFioRow) {
  return Boolean(row.esquerda || row.direita || row.cabo || row.cabod || row.cor_do_fio);
}

function applyGuiaFioRules(
  rows: GuiaFioRow[],
  descriptionsByGuide: Map<number, string>
): GuiaFioRow[] {
  return rows.map((row) => {
    const description = descriptionsByGuide.get(row.numero) ?? row.direita ?? '';
    const cabo = resolveCaboForBico(row.numero, description, row.cabod ?? row.cabo);

    if (row.numero === 1 || row.numero === 2) {
      if (!guiaRowFilled(row)) return row;
      return {
        ...row,
        cabo: null,
        cabod: cabo,
      };
    }

    if (row.numero === 8 && guiaRowFilled(row)) {
      return {
        ...row,
        esquerda: null,
        cabo: null,
        direita: RESTO_FIO_NOME,
        cabod: cabo,
        cor_do_fio: GUIA_COR_BICO_8,
      };
    }

    return row;
  });
}

export function buildGuiaFioRows(modelFolder: string, partFileNames: string[]): GuiaFioRow[] {
  const byGuide = new Map<number, GuiaFioRow>();
  const descriptionsByGuide = new Map<number, string>();

  for (const sin of readSinTextsForModel(modelFolder, partFileNames)) {
    const parsed = parseYarnGuidesFromSin(sin.text);
    for (const guide of parsed.guides) {
      const fields = guideToGuiaFields(guide);
      const row: GuiaFioRow = { numero: guide.guide, ...fields };
      const existing = byGuide.get(guide.guide);
      byGuide.set(guide.guide, existing ? mergeGuiaRow(existing, row) : row);

      const prev = descriptionsByGuide.get(guide.guide);
      if (!prev || guide.description.length > prev.length) {
        descriptionsByGuide.set(guide.guide, guide.description);
      }
    }
  }

  const rows: GuiaFioRow[] = [];
  for (let numero = 1; numero <= GUIA_SLOT_COUNT; numero++) {
    rows.push(byGuide.get(numero) ?? emptyGuiaRow(numero));
  }

  return applyGuiaFioRules(rows, descriptionsByGuide);
}

export function countFilledGuiaFioRows(rows: GuiaFioRow[]) {
  return rows.filter(
    (row) => row.esquerda || row.direita || row.cabo || row.cabod || row.cor_do_fio
  ).length;
}
