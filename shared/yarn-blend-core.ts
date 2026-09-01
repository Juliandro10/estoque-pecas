import {
  formatYarnComponentDescription,
  parseYarnDescriptionComponents,
  type ParsedYarnComponent,
} from './yarn-description-parse';
import { nativeBicoSlotPriority, type YarnSide } from './guia-fio-text';

const PHYSICAL_BARS = 8;
const OVERFLOW_SLOTS = [9, 10, 11, 12, 13, 14, 15, 16];

export type YarnWeightFactorsFile = {
  default_factor: number;
  types: Record<string, number>;
};

/** 1 cabo elastano × 1 cabo linha (mesmo % simx) → 8% / 92% do peso. */
export const ELASTANO_WEIGHT_FACTOR = 8 / 92;

export const DEFAULT_YARN_WEIGHT_FACTORS: YarnWeightFactorsFile = {
  default_factor: 1,
  types: {
    CAPRICE: 2.5,
    'FIO LANTEJOULA': 2.5,
    LANTEJOULA: 2.5,
    PAETE: 2.5,
    LINHA: 1,
    ELASTANO: ELASTANO_WEIGHT_FACTOR,
    LASTEX: 1,
  },
};

let cachedWeightFactors: YarnWeightFactorsFile | null = null;

export function loadYarnWeightFactors(): YarnWeightFactorsFile {
  if (cachedWeightFactors) return cachedWeightFactors;
  cachedWeightFactors = DEFAULT_YARN_WEIGHT_FACTORS;
  return cachedWeightFactors;
}

export function setYarnWeightFactors(factors: YarnWeightFactorsFile) {
  cachedWeightFactors = factors;
}

export type ProcessYarnInput = {
  guide: number;
  letter?: string;
  description: string;
  consumption: string;
  pct?: number;
  tipo_fio_codigo?: number;
  side?: YarnSide;
  parts?: string[];
};

export type ProcessYarnComponent = {
  guide: number;
  slot: number;
  letter?: string;
  description: string;
  tipo: string;
  cor: string | null;
  cabo: number | null;
  consumptionKg: number;
  pct: number;
  weightShare: number;
  componentIndex: number;
  isPrimary: boolean;
  tipo_fio_codigo?: number;
  side?: YarnSide;
  parts?: string[];
  /** Descrição consolidada do guia (mistura completa, se houver). */
  consolidatedDescription: string;
};

export type GuiaCaboHint = {
  cabo?: string | null;
  cabod?: string | null;
};

export type ExpandProcessYarnOptions = {
  guiaCabos?: Map<number, GuiaCaboHint>;
  resolveCabo?: (guide: number, description: string, parsedCabo: string | null) => number | null;
  /** Peso do pano (balança) — % Syntech = consumo / este valor (fixos 1–2 entram a mais). */
  partWeightKg?: number;
};

function defaultResolveCabo(
  guide: number,
  description: string,
  parsedCabo: string | null
): number | null {
  if (guide === 1 || guide === 2) return 1;
  if (guide === 8 && !parsedCabo) {
    const match = description.match(/(\d+)\s+CABOS?\w*/i)?.[1];
    if (match) {
      const value = Number(match);
      return Number.isFinite(value) ? value : null;
    }
  }
  if (!parsedCabo) return null;
  const value = Number(parsedCabo);
  return Number.isFinite(value) ? value : null;
}

export function yarnWeightFactor(
  tipo: string,
  factors: YarnWeightFactorsFile = loadYarnWeightFactors()
) {
  const upper = tipo.trim().toUpperCase();
  for (const [key, value] of Object.entries(factors.types)) {
    if (upper.includes(key.toUpperCase())) return value;
  }
  return factors.default_factor;
}

export function yarnWeightFactorFromDescription(
  description: string,
  factors: YarnWeightFactorsFile = loadYarnWeightFactors()
) {
  const upper = description.trim().toUpperCase();
  for (const [key, value] of Object.entries(factors.types)) {
    if (upper.includes(key.toUpperCase())) return value;
  }
  return factors.default_factor;
}

export function parseCabosForWeightShare(guide: number, description: string) {
  if (guide === 1 || guide === 2) return 1;
  const text = description.trim();
  const numeric = text.match(/(\d+)\s+CABOS?\w*/i);
  if (numeric) {
    const value = Number(numeric[1]);
    return Number.isFinite(value) && value > 0 ? value : 1;
  }
  if (/\bTRES\s+CABOS?\b/i.test(text)) return 3;
  if (/\bDOIS\s+CABOS?\b/i.test(text)) return 2;
  return 1;
}

export function fabricGuideWeightShare(
  guide: { guide: number; pct?: number; description: string },
  factors: YarnWeightFactorsFile = loadYarnWeightFactors()
) {
  const pct = guide.pct ?? 0;
  if (pct <= 0) return 0;
  const cabos = parseCabosForWeightShare(guide.guide, guide.description);
  const factor = yarnWeightFactorFromDescription(guide.description, factors);
  return pct * cabos * factor;
}

export function fabricWeightShareSum(
  guides: { guide: number; pct?: number; description: string }[],
  isFixedWasteGuide: (guide: number) => boolean
) {
  return guides
    .filter((guide) => !isFixedWasteGuide(guide.guide))
    .reduce((sum, guide) => sum + fabricGuideWeightShare(guide), 0);
}

export function splitComponentWeightShares(
  components: ParsedYarnComponent[],
  factors: YarnWeightFactorsFile = loadYarnWeightFactors()
) {
  const weights = components.map((component) => {
    const cabos = Number(component.cabo) || 1;
    return cabos * yarnWeightFactor(component.tipo, factors);
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (total <= 0) {
    const even = 1 / components.length;
    return components.map(() => even);
  }
  return weights.map((value) => value / total);
}

function descriptionSlotKey(description: string) {
  return description.trim().toUpperCase().replace(/\s+/g, ' ');
}

function consolidatedRowKey(row: Pick<ProcessYarnInput, 'guide' | 'letter' | 'description'>) {
  const letter = (row.letter ?? 'A').trim().toUpperCase() || 'A';
  return `${row.guide}:${letter}:${descriptionSlotKey(row.description ?? '')}`;
}

export function allocateBicoSlots(
  entries: {
    guide: number;
    letter?: string;
    count: number;
    side?: YarnSide;
    parts?: string[];
    description?: string;
  }[]
) {
  const activeGuides = new Set(
    entries.filter((item) => item.count > 0).map((item) => item.guide)
  );
  const usedSlots = new Set<number>();
  const slots = new Map<string, number>();

  const sorted = [...entries]
    .filter((item) => item.count > 0)
    .sort(
      (a, b) =>
        a.guide - b.guide ||
        nativeBicoSlotPriority(a) - nativeBicoSlotPriority(b) ||
        (a.letter ?? 'A').localeCompare(b.letter ?? 'A', 'pt-BR') ||
        descriptionSlotKey(a.description ?? '').localeCompare(descriptionSlotKey(b.description ?? ''), 'pt-BR')
    );

  for (const entry of sorted) {
    const rowKey = consolidatedRowKey({
      guide: entry.guide,
      letter: entry.letter,
      description: entry.description ?? '',
    });
    for (let index = 0; index < entry.count; index++) {
      let slot: number | null = null;
      if (
        index === 0 &&
        entry.guide >= 1 &&
        entry.guide <= PHYSICAL_BARS &&
        !usedSlots.has(entry.guide)
      ) {
        slot = entry.guide;
      } else {
        slot = findExtraSlot(entry.guide, activeGuides, usedSlots);
      }
      if (slot === null) {
        throw new Error(
          `Sem slot livre para componente ${index + 1} do bico ${entry.guide}${entry.letter ? ` (${entry.letter})` : ''}`
        );
      }
      slots.set(`${rowKey}:${index}`, slot);
      usedSlots.add(slot);
    }
  }

  return slots;
}

function findExtraSlot(guide: number, activeGuides: Set<number>, usedSlots: Set<number>) {
  for (let slot = guide + 1; slot <= PHYSICAL_BARS; slot++) {
    if (activeGuides.has(slot)) continue;
    if (usedSlots.has(slot)) continue;
    return slot;
  }

  for (const slot of OVERFLOW_SLOTS) {
    if (!usedSlots.has(slot)) return slot;
  }

  return null;
}

function parseConsumptionKg(raw: string) {
  const text = raw.trim().replace(',', '.');
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
}

function roundPerc(value: number) {
  return Math.round(value * 100) / 100;
}

function roundKg(value: number) {
  return Math.round(value * 1000) / 1000;
}

export function expandProcessYarnComponents(
  consolidated: ProcessYarnInput[],
  options: ExpandProcessYarnOptions = {},
  yarnTypes: string[] = [],
  factors: YarnWeightFactorsFile = loadYarnWeightFactors()
): ProcessYarnComponent[] {
  const guiaCabos = options.guiaCabos ?? new Map<number, GuiaCaboHint>();
  const resolveCabo = options.resolveCabo ?? defaultResolveCabo;

  const activeRows = consolidated.filter((row) => parseConsumptionKg(row.consumption) > 0);

  const rowEntries = activeRows.map((row) => {
    const components = parseYarnDescriptionComponents(row.description, yarnTypes);
    return {
      key: consolidatedRowKey(row),
      row,
      count: Math.max(components.length, 1),
    };
  });

  const slotMap = allocateBicoSlots(
    rowEntries.map(({ row, count }) => ({
      guide: row.guide,
      letter: row.letter,
      description: row.description,
      count,
      side: row.side,
      parts: row.parts,
    }))
  );
  const totalPeso = activeRows.reduce((sum, row) => sum + parseConsumptionKg(row.consumption), 0);
  const expanded: ProcessYarnComponent[] = [];

  for (const { key, row } of rowEntries) {
    const parsed = parseYarnDescriptionComponents(row.description, yarnTypes);
    const components =
      parsed.length > 0
        ? parsed
        : [{ tipo: row.description, cabo: null, cor: null, raw: row.description }];
    const shares = splitComponentWeightShares(components, factors);
    const guideKg = parseConsumptionKg(row.consumption);
    const guia = guiaCabos.get(row.guide);

    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      const slot = slotMap.get(`${key}:${index}`);
      if (slot === undefined) continue;

      const caboRaw = component.cabo ?? guia?.cabod ?? guia?.cabo ?? null;
      const cabo = resolveCabo(row.guide, component.raw, caboRaw);
      const consumptionKg = roundKg(guideKg * shares[index]);
      const pct =
        options.partWeightKg && options.partWeightKg > 0
          ? roundPerc((consumptionKg / options.partWeightKg) * 100)
          : row.pct && row.pct > 0
            ? roundPerc(row.pct * shares[index])
            : totalPeso > 0
              ? roundPerc(((guideKg * shares[index]) / totalPeso) * 100)
              : 0;

      expanded.push({
        guide: row.guide,
        slot,
        letter: row.letter,
        description: component.raw || formatYarnComponentDescription(component),
        tipo: component.tipo,
        cor: component.cor,
        cabo,
        consumptionKg,
        pct,
        weightShare: shares[index],
        componentIndex: index,
        isPrimary: index === 0,
        tipo_fio_codigo: index === 0 ? row.tipo_fio_codigo : undefined,
        side: row.side,
        parts: row.parts,
        consolidatedDescription: row.description,
      });
    }
  }

  return expanded.sort((a, b) => a.slot - b.slot || a.guide - b.guide);
}

export { parseYarnDescriptionComponents } from './yarn-description-parse';
