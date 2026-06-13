import {
  formatYarnComponentDescription,
  parseYarnDescriptionComponents,
  type ParsedYarnComponent,
} from './yarn-description-parse';

const OVERFLOW_SLOTS = [9, 10];
const MAX_BICO_SLOT = 10;

export type YarnWeightFactorsFile = {
  default_factor: number;
  types: Record<string, number>;
};

export const DEFAULT_YARN_WEIGHT_FACTORS: YarnWeightFactorsFile = {
  default_factor: 1,
  types: {
    CAPRICE: 2.5,
    LINHA: 1,
    ELASTANO: 1.2,
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

export function allocateBicoSlots(guideComponentCounts: { guide: number; count: number }[]) {
  const activeGuides = new Set(
    guideComponentCounts.filter((item) => item.count > 0).map((item) => item.guide)
  );
  const usedSlots = new Set<number>();
  const slots = new Map<string, number>();

  const sorted = [...guideComponentCounts]
    .filter((item) => item.count > 0)
    .sort((a, b) => a.guide - b.guide);

  for (const { guide, count } of sorted) {
    if (guide >= 1 && guide <= MAX_BICO_SLOT) {
      slots.set(`${guide}:0`, guide);
      usedSlots.add(guide);
    }

    for (let index = 1; index < count; index++) {
      const slot = findExtraSlot(guide, activeGuides, usedSlots);
      if (slot === null) {
        throw new Error(`Sem slot livre para componente ${index + 1} do bico ${guide}`);
      }
      slots.set(`${guide}:${index}`, slot);
      usedSlots.add(slot);
    }
  }

  return slots;
}

function findExtraSlot(guide: number, activeGuides: Set<number>, usedSlots: Set<number>) {
  for (let slot = guide + 1; slot <= 8; slot++) {
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

  const byGuide = new Map<number, ProcessYarnInput>();
  for (const row of consolidated) {
    if (!byGuide.has(row.guide)) byGuide.set(row.guide, row);
  }

  const guideComponentCounts = [...byGuide.entries()].map(([guide, row]) => {
    const components = parseYarnDescriptionComponents(row.description, yarnTypes);
    return { guide, count: Math.max(components.length, 1) };
  });

  const slotMap = allocateBicoSlots(guideComponentCounts);
  const totalPeso = consolidated.reduce((sum, row) => sum + parseConsumptionKg(row.consumption), 0);
  const expanded: ProcessYarnComponent[] = [];

  for (const { guide } of guideComponentCounts.sort((a, b) => a.guide - b.guide)) {
    const row = byGuide.get(guide);
    if (!row) continue;

    const parsed = parseYarnDescriptionComponents(row.description, yarnTypes);
    const components =
      parsed.length > 0
        ? parsed
        : [{ tipo: row.description, cabo: null, cor: null, raw: row.description }];
    const shares = splitComponentWeightShares(components, factors);
    const guideKg = parseConsumptionKg(row.consumption);
    const guia = guiaCabos.get(guide);

    for (let index = 0; index < components.length; index++) {
      const component = components[index];
      const slot = slotMap.get(`${guide}:${index}`);
      if (slot === undefined) continue;

      const caboRaw = component.cabo ?? guia?.cabod ?? guia?.cabo ?? null;
      const cabo = resolveCabo(guide, component.raw, caboRaw);
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
        guide,
        slot,
        letter: row.letter,
        description: formatYarnComponentDescription(component),
        tipo: component.tipo,
        cor: component.cor,
        cabo,
        consumptionKg,
        pct,
        weightShare: shares[index],
        componentIndex: index,
        isPrimary: index === 0,
        tipo_fio_codigo: index === 0 ? row.tipo_fio_codigo : undefined,
      });
    }
  }

  return expanded.sort((a, b) => a.slot - b.slot || a.guide - b.guide);
}

export { parseYarnDescriptionComponents } from './yarn-description-parse';
