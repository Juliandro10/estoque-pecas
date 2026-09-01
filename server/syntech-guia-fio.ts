import type { SinYarnGuide } from './sin-yarn';
import { parseYarnGuidesFromSin } from './sin-yarn';
import { readSinTextsForModel } from './sin-read';
import { GUIA_COR_BICO_8, resolveCaboForBico } from './syntech-bico-rules';
import { clipSyntechText } from './syntech-db';
import { yarnTypesFromCatalog } from './syntech-yarn-types';
import { parseYarnDescription } from './yarn-description-parse';
import { yarnFioIdentityKey } from '../shared/yarn-consumption';
import {
  compactGuiaSideNote,
  shortPartKind,
  type GuiaSideYarnNote,
} from '../shared/guia-fio-text';

const GUIA_SLOT_COUNT = 8;

export type GuiaFioRow = {
  numero: number;
  esquerda: string | null;
  cabo: string | null;
  direita: string | null;
  cabod: string | null;
  cor_do_fio: string | null;
};

type SideNotes = Map<string, GuiaSideYarnNote>;

type GuideNotes = {
  left: SideNotes;
  right: SideNotes;
};

function clipGuiaText(value: string | null) {
  if (!value) return null;
  const text = clipSyntechText(value, 40);
  return text || null;
}

function emptyNotes(): GuideNotes {
  return { left: new Map(), right: new Map() };
}

function addSideNote(bucket: SideNotes, description: string, partKind: string) {
  const key = yarnFioIdentityKey(description) || description.toUpperCase();
  const existing = bucket.get(key);
  if (existing) {
    if (partKind && !existing.parts.includes(partKind)) existing.parts.push(partKind);
    return;
  }
  bucket.set(key, { description, parts: partKind ? [partKind] : [] });
}

function uniqueColors(notes: GuiaSideYarnNote[]) {
  const types = yarnTypesFromCatalog();
  const colors: string[] = [];
  const seen = new Set<string>();
  for (const note of notes) {
    const parsed = parseYarnDescription(note.description, types);
    const cor = parsed.cor?.trim();
    if (!cor) continue;
    const key = cor.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    colors.push(cor);
  }
  return colors;
}

function caboFromNotes(notes: GuiaSideYarnNote[]) {
  const types = yarnTypesFromCatalog();
  for (const note of notes) {
    if (note.parts.length > 0 && note.parts.every((part) => part === 'ACAB' || part === 'GOLA')) {
      continue;
    }
    const parsed = parseYarnDescription(note.description, types);
    if (parsed.cabo) return parsed.cabo;
  }
  for (const note of notes) {
    const parsed = parseYarnDescription(note.description, types);
    if (parsed.cabo) return parsed.cabo;
  }
  return null;
}

function sideFields(notes: GuiaSideYarnNote[]): { text: string | null; cabo: string | null; cor: string | null } {
  if (notes.length === 0) return { text: null, cabo: null, cor: null };
  const text = clipGuiaText(compactGuiaSideNote(notes));
  const cabo = caboFromNotes(notes);
  const colors = uniqueColors(notes);
  const cor =
    colors.length === 0 ? null : colors.length === 1 ? clipGuiaText(colors[0]) : GUIA_COR_BICO_8;
  return { text, cabo, cor };
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

function applyGuiaFioRules(rows: GuiaFioRow[]): GuiaFioRow[] {
  return rows.map((row) => {
    const description = row.direita ?? row.esquerda ?? '';
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

function collectGuide(guide: SinYarnGuide, partKind: string, notes: GuideNotes) {
  addSideNote(notes[guide.side], guide.description, partKind);
}

export function buildGuiaFioRows(modelFolder: string, partFileNames: string[]): GuiaFioRow[] {
  const byGuide = new Map<number, GuideNotes>();

  for (const sin of readSinTextsForModel(modelFolder, partFileNames)) {
    const partKind = shortPartKind(sin.part_base);
    const parsed = parseYarnGuidesFromSin(sin.text);
    for (const guide of parsed.guides) {
      const notes = byGuide.get(guide.guide) ?? emptyNotes();
      collectGuide(guide, partKind, notes);
      byGuide.set(guide.guide, notes);
    }
  }

  const rows: GuiaFioRow[] = [];
  for (let numero = 1; numero <= GUIA_SLOT_COUNT; numero++) {
    const notes = byGuide.get(numero);
    if (!notes) {
      rows.push(emptyGuiaRow(numero));
      continue;
    }
    const left = sideFields([...notes.left.values()]);
    const right = sideFields([...notes.right.values()]);
    rows.push({
      numero,
      esquerda: left.text,
      cabo: left.cabo,
      direita: right.text,
      cabod: right.cabo,
      cor_do_fio: right.cor ?? left.cor,
    });
  }

  return applyGuiaFioRules(rows);
}

export function countFilledGuiaFioRows(rows: GuiaFioRow[]) {
  return rows.filter(
    (row) => row.esquerda || row.direita || row.cabo || row.cabod || row.cor_do_fio
  ).length;
}
