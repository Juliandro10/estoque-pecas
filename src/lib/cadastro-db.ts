import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from 'firebase/firestore';

import { db } from '../firebase';
import type { CadastroPart, CadastroYarnGuide, CadastroYarnPart, ConsolidatedYarnRow, ModelCadastro, SinYarnPartResult } from '../types-programming';

const cadastroCol = 'model_cadastro';

function mapYarnGuide(raw: Record<string, unknown>): CadastroYarnGuide {
  const pctRaw = raw.pct;
  return {
    guide: Number(raw.guide ?? 0),
    letter: String(raw.letter ?? ''),
    description: String(raw.description ?? ''),
    side: raw.side === 'left' ? 'left' : 'right',
    pct: pctRaw === undefined || pctRaw === null || pctRaw === '' ? undefined : Number(pctRaw),
    consumption: String(raw.consumption ?? ''),
  };
}

function mapYarnPart(raw: Record<string, unknown>): CadastroYarnPart {
  const guides = Array.isArray(raw.guides) ? raw.guides.map((g) => mapYarnGuide(g as Record<string, unknown>)) : [];
  return {
    key: String(raw.key ?? ''),
    label: String(raw.label ?? ''),
    file_name: String(raw.file_name ?? ''),
    guides,
  };
}

function mapCadastro(id: string, data: Record<string, unknown>): ModelCadastro {
  const parts = Array.isArray(data.parts) ? (data.parts as CadastroPart[]) : [];
  const yarnParts = Array.isArray(data.yarn_parts)
    ? data.yarn_parts.map((part) => mapYarnPart(part as Record<string, unknown>))
    : [];
  return {
    reference: String(data.reference ?? id),
    name: String(data.name ?? ''),
    parts,
    yarn_parts: yarnParts,
    yarn_notes: String(data.yarn_notes ?? ''),
    observations: String(data.observations ?? ''),
    updated_at: data.updated_at instanceof Timestamp
      ? data.updated_at.toDate().toISOString()
      : String(data.updated_at ?? new Date().toISOString()),
  };
}

export const cadastroDb = {
  get: async (reference: string) => {
    const ref = reference.trim();
    const snap = await getDoc(doc(db, cadastroCol, ref));
    if (!snap.exists()) return null;
    return mapCadastro(snap.id, snap.data());
  },

  save: async (input: {
    reference: string;
    name: string;
    parts: CadastroPart[];
    yarn_parts: CadastroYarnPart[];
    observations: string;
  }) => {
    const reference = input.reference.trim();
    await setDoc(doc(db, cadastroCol, reference), {
      reference,
      name: input.name.trim(),
      parts: input.parts,
      yarn_parts: input.yarn_parts,
      observations: input.observations.trim(),
      updated_at: serverTimestamp(),
    });
    const saved = await getDoc(doc(db, cadastroCol, reference));
    return mapCadastro(saved.id, saved.data()!);
  },
};

export function defaultAcabPart(): CadastroPart {
  return {
    key: 'ACAB',
    label: 'ACAB',
    file_name: '',
    time_mmss: '',
    weight_kg: '',
  };
}

export function parseTimeInput(raw: string) {
  const text = raw.trim().toLowerCase();
  if (!text) return '';

  const hms = text.match(/(\d+)\s*h(?:oras?)?\s*(\d+)\s*m(?:in(?:utos?)?)?(?:\s*(\d+)\s*s(?:eg)?)?/);
  if (hms) {
    const h = Number(hms[1]);
    const m = Number(hms[2]);
    const s = Number(hms[3] ?? 0);
    return formatMmSs(h * 3600 + m * 60 + s);
  }

  const minSec = text.match(/(\d+)\s*min(?:utos?)?\s*(\d+)\s*sec?/);
  if (minSec) return formatMmSs(Number(minSec[1]) * 60 + Number(minSec[2]));

  const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (colon) {
    const a = Number(colon[1]);
    const b = Number(colon[2]);
    const c = colon[3] ? Number(colon[3]) : null;
    if (c !== null) return formatMmSs(a * 3600 + b * 60 + c);
    return formatMmSs(a * 60 + b);
  }

  if (/^\d+$/.test(text)) return formatMmSs(Number(text));
  return raw.trim();
}

function formatMmSs(totalSec: number) {
  const rounded = Math.max(0, Math.round(totalSec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function programPartsOnly(parts: CadastroPart[]) {
  return parts.filter((part) => part.file_name && /\.mdv$/i.test(part.file_name));
}

export function duplicatePart(part: CadastroPart): CadastroPart {
  return {
    key: part.key,
    label: part.label,
    file_name: part.file_name,
    time_mmss: part.time_mmss,
    weight_kg: part.weight_kg,
  };
}

export function yarnGuideKey(guide: Pick<CadastroYarnGuide, 'side' | 'guide' | 'letter'>) {
  return `${guide.side}:${guide.guide}:${guide.letter}`;
}

export function parseConsumptionInput(raw: string) {
  const text = raw.trim().replace(',', '.');
  if (!text) return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
}

const CONSUMPTION_SCALE = 1000;

/** Separação (1) e elástico pente (2) — fixos por peça acabada, além do peso do pano (descartados antes da pesagem). */
const PROGRAM_FIXED_WASTE_KG: Partial<Record<number, number>> = {
  1: 0.02,
  2: 0.01,
};

export function isProgramFixedWasteYarnGuide(guide: number) {
  return PROGRAM_FIXED_WASTE_KG[guide] !== undefined;
}

export function programFixedWasteYarnTotalKg() {
  return (PROGRAM_FIXED_WASTE_KG[1] ?? 0) + (PROGRAM_FIXED_WASTE_KG[2] ?? 0);
}

export function roundConsumption(value: number) {
  if (!value || value <= 0) return 0;
  return Math.round(value * CONSUMPTION_SCALE) / CONSUMPTION_SCALE;
}

/** @deprecated use roundConsumption */
export function ceilConsumption(value: number) {
  return roundConsumption(value);
}

export function ceilPct(value: number) {
  if (!value || value <= 0) return 0;
  return Math.ceil(value * 100 - 1e-12) / 100;
}

function formatFixedConsumption(value: number) {
  return value.toFixed(3).replace('.', ',');
}

export function formatConsumption(value: number) {
  const rounded = roundConsumption(value);
  if (!rounded) return '';
  return rounded.toFixed(3).replace('.', ',');
}

/** Normaliza texto digitado ao sair do campo (ex.: 0,07 → 0,070). */
export function formatConsumptionInput(raw: string) {
  const text = raw.trim();
  if (!text) return '';
  return formatConsumption(parseConsumptionInput(text));
}

export function formatPct(value: number, options?: { ceil?: boolean }) {
  if (!value || value <= 0) return '—';
  const rounded = options?.ceil ? ceilPct(value) : Math.round(value * 100) / 100;
  return `${rounded.toFixed(2).replace('.', ',')}%`;
}

export function totalPartsWeight(parts: CadastroPart[]) {
  return programPartsOnly(parts).reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
}

export function totalYarnConsumption(consolidated: ConsolidatedYarnRow[]) {
  return consolidated.reduce((sum, row) => sum + parseConsumptionInput(row.consumption), 0);
}

export function totalCalculatedYarnConsumption(consolidated: ConsolidatedYarnRow[]) {
  return consolidated
    .filter((row) => !isProgramFixedWasteYarnGuide(row.guide))
    .reduce((sum, row) => sum + parseConsumptionInput(row.consumption), 0);
}

/** Peso do pano + sep./elást. fixos (total matéria-prima do programa). */
export function totalMatPrimaConsumption(consolidated: ConsolidatedYarnRow[]) {
  return totalYarnConsumption(consolidated);
}

/** Chave de consolidação — ignora variações como "ELASTICO PENTE" vs "ELASTICO DE PENTE". */
export function normalizeYarnDescriptionKey(description: string) {
  let text = description.trim().toUpperCase();
  if (!text) return '';

  text = text.replace(/\b(DE|DO|DA|DOS|DAS)\b/g, ' ');
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/** Mesmo bico + mesma descrição = um fio (letra pode variar entre partes). */
function consolidatedYarnKey(guide: Pick<CadastroYarnGuide, 'guide' | 'letter' | 'description'>) {
  const desc = normalizeYarnDescriptionKey(guide.description);
  if (desc) return `${guide.guide}:${desc}`;
  return `${guide.guide}:${guide.letter.toUpperCase()}`;
}

function pickRicherYarnDescription(current: string, incoming: string) {
  const a = current.trim();
  const b = incoming.trim();
  if (!a) return b;
  if (!b) return a;
  return b.length > a.length ? b : a;
}

function formatPartContribution(label: string, count: number) {
  return count > 1 ? `${label}×${count}` : label;
}

export function consolidateYarnParts(
  yarnParts: CadastroYarnPart[],
  parts: CadastroPart[] = []
): ConsolidatedYarnRow[] {
  const rows = new Map<string, ConsolidatedYarnRow & { sum: number; letters: Set<string> }>();
  const totalPartWeight = programPartsOnly(parts).reduce(
    (sum, part) => sum + parseConsumptionInput(part.weight_kg),
    0
  );

  for (const yarnPart of yarnParts) {
    const matchingParts = programPartsOnly(parts).filter((part) => partMatchesYarnPart(part, yarnPart));
    const multiplier = matchingParts.length || 1;
    const partLabel =
      matchingParts.length > 0
        ? formatPartContribution(matchingParts[0].label, multiplier)
        : formatPartContribution(yarnPart.label, 1);

    for (const guide of yarnPart.guides) {
      const key = consolidatedYarnKey(guide);
      const add = parseConsumptionInput(guide.consumption);
      const existing = rows.get(key);

      if (existing) {
        existing.sum += add;
        existing.letters.add(guide.letter.toUpperCase());
        existing.letter = [...existing.letters].sort((a, b) => a.localeCompare(b, 'pt-BR')).join('/');
        existing.consumption = formatConsumption(existing.sum);
        existing.description = pickRicherYarnDescription(existing.description, guide.description);
        if (!existing.parts.includes(partLabel)) existing.parts.push(partLabel);
        continue;
      }

      rows.set(key, {
        guide: guide.guide,
        letter: guide.letter.toUpperCase(),
        description: guide.description,
        pct: 0,
        consumption: formatConsumption(add),
        parts: [partLabel],
        sum: add,
        letters: new Set([guide.letter.toUpperCase()]),
      });
    }
  }

  return [...rows.values()]
    .sort((a, b) => a.guide - b.guide || a.letter.localeCompare(b.letter, 'pt-BR'))
    .map(({ sum, letters: _letters, ...row }) => ({
      ...row,
      pct: totalPartWeight > 0 ? (sum / totalPartWeight) * 100 : 0,
    }));
}

function partBaseFromFileName(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim().toUpperCase();
}

/** Syntech trunca PARTE em 15 chars (ex.: BLUSA-TRANCAS-M vs BLUSA-TRANCAS-MG). */
function partLabelSuffixCompatible(partLabel: string, yarnLabel: string) {
  const a = partLabel.trim().toUpperCase();
  const b = yarnLabel.trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith('-M') && b.endsWith('-MG') && a + 'G' === b) return true;
  if (b.endsWith('-M') && a.endsWith('-MG') && b + 'G' === a) return true;
  if (a.length >= 14 && (b.startsWith(a) || a.startsWith(b))) return true;
  return false;
}

function partFileSuffixCompatible(partFile: string, yarnFile: string) {
  if (!partFile || !yarnFile) return false;
  if (partFile === yarnFile) return true;
  if (partFile.endsWith('-M') && yarnFile.endsWith('-MG') && partFile + 'G' === yarnFile) return true;
  if (yarnFile.endsWith('-M') && partFile.endsWith('-MG') && yarnFile + 'G' === partFile) return true;
  return false;
}

export function partMatchesYarnPart(part: CadastroPart, yarnPart: CadastroYarnPart) {
  const partFile = partBaseFromFileName(part.file_name);
  const yarnFile = partBaseFromFileName(yarnPart.file_name);
  if (partFile && yarnFile && partFileSuffixCompatible(partFile, yarnFile)) return true;

  const partLabel = part.label.trim().toUpperCase();
  const yarnLabel = yarnPart.label.trim().toUpperCase();
  if (partLabel && yarnLabel && partLabelSuffixCompatible(partLabel, yarnLabel)) return true;

  if (partFile && yarnLabel && (partFile === yarnLabel || partFile.endsWith(`-${yarnLabel}`))) {
    return true;
  }
  if (yarnFile && partLabel && (yarnFile === partLabel || yarnFile.endsWith(`-${partLabel}`))) {
    return true;
  }

  return false;
}

/** % simx dos guias 1–2 (descartados antes da pesagem) — base para escalar o tecido. */
function wastePctOnYarnPart(guides: CadastroYarnGuide[]) {
  return guides
    .filter((guide) => isProgramFixedWasteYarnGuide(guide.guide))
    .reduce((sum, guide) => sum + (guide.pct ?? 0), 0);
}

function totalWeightForYarnPart(parts: CadastroPart[], yarnPart: CadastroYarnPart) {
  return programPartsOnly(parts)
    .filter((part) => partMatchesYarnPart(part, yarnPart))
    .reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
}

/** Garante linha de peso para cada .sin/.simx lido (ex.: manga no cadastro incompleto). */
export function ensurePartsForYarnParts(
  parts: CadastroPart[],
  yarnParts: CadastroYarnPart[]
): CadastroPart[] {
  const result = [...parts];
  for (const yarnPart of yarnParts) {
    const matched = programPartsOnly(result).some((part) => partMatchesYarnPart(part, yarnPart));
    if (matched || !yarnPart.file_name) continue;
    result.push({
      key: yarnPart.key || yarnPart.label.toUpperCase(),
      label: yarnPart.label,
      file_name: yarnPart.file_name,
      time_mmss: '',
      weight_kg: '',
    });
  }
  return result;
}

export function applyAutoYarnConsumption(
  yarnParts: CadastroYarnPart[],
  parts: CadastroPart[] = []
): CadastroYarnPart[] {
  const fixedAssigned = new Set<number>();

  return yarnParts.map((yarnPart) => {
    const weight = totalWeightForYarnPart(parts, yarnPart);
    const fabricPctBase = Math.max(0, 100 - wastePctOnYarnPart(yarnPart.guides));

    return {
      ...yarnPart,
      guides: yarnPart.guides.map((guide) => {
        const fixedTotal = PROGRAM_FIXED_WASTE_KG[guide.guide];
        if (fixedTotal !== undefined) {
          if (!fixedAssigned.has(guide.guide)) {
            fixedAssigned.add(guide.guide);
            return { ...guide, consumption: formatFixedConsumption(fixedTotal) };
          }
          return { ...guide, consumption: '' };
        }
        const pct = guide.pct ?? 0;
        const consumption =
          weight > 0 && pct > 0 && fabricPctBase > 0
            ? formatConsumption(weight * (pct / fabricPctBase))
            : '';
        return { ...guide, consumption };
      }),
    };
  });
}

export function mergeYarnPartsFromSin(
  fromSin: SinYarnPartResult[],
  _saved: CadastroYarnPart[] = []
): CadastroYarnPart[] {
  return fromSin.map((sinPart) => ({
      key: sinPart.label.toUpperCase(),
      label: sinPart.label,
      file_name: sinPart.file_name,
    guides: sinPart.guides.map((guide) => ({
      ...guide,
      pct: guide.pct,
      consumption: '',
    })),
  }));
}
