import type { SinYarnGuide } from './sin-yarn';
import { parseYarnGuidesFromSin } from './sin-yarn';
import { readSinTextsForModel } from './sin-read';
import { resolveCaboForBico } from './syntech-bico-rules';
import { clipSyntechText } from './syntech-db';
import { yarnTypesFromCatalog } from './syntech-yarn-types';
import {
  parseYarnDescription,
  parseYarnDescriptionComponents,
} from './yarn-description-parse';

const GUIA_SLOT_COUNT = 8;

export type GuiaFioRow = {
  numero: number;
  esquerda: string | null;
  cabo: string | null;
  direita: string | null;
  cabod: string | null;
  cor_do_fio: string | null;
};

function parseGuideDescription(description: string) {
  return parseYarnDescription(description, yarnTypesFromCatalog());
}

function clipGuiaText(value: string | null) {
  if (!value) return null;
  const text = clipSyntechText(value, 40);
  return text || null;
}

function guideToGuiaFields(guide: SinYarnGuide): Omit<GuiaFioRow, 'numero'> {
  const components = parseYarnDescriptionComponents(guide.description, yarnTypesFromCatalog());

  if (components.length >= 2) {
    const [first, second] = components;
    const firstTipo = clipGuiaText(first.tipo) ?? '';
    const secondTipo = clipGuiaText(second.tipo) ?? '';
    const firstCor = clipGuiaText(first.cor);
    const secondCor = clipGuiaText(second.cor);

    return {
      esquerda: secondTipo,
      cabo: second.cabo,
      direita: firstTipo,
      cabod: first.cabo,
      cor_do_fio: firstCor ?? secondCor,
    };
  }

  const { tipo, cabo, cor } = parseGuideDescription(guide.description);
  const tipoText = clipGuiaText(tipo) ?? '';
  const corText = clipGuiaText(cor);

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
