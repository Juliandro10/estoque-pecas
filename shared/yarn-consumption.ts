/** Cálculo de consumo de fio — sem Firebase (cliente + servidor). */

export type YarnGuideRow = {
  guide: number;
  letter: string;
  description: string;
  side?: 'left' | 'right';
  pct?: number;
  consumption?: string;
};

export type YarnPartRow = {
  key?: string;
  label: string;
  file_name: string;
  guides: YarnGuideRow[];
};

export type PartWeightRow = {
  label: string;
  file_name: string;
  weight_kg: string;
};

export type ConsolidatedYarnOutput = {
  guide: number;
  letter: string;
  description: string;
  pct: number;
  consumption: string;
  parts: string[];
};

const CONSUMPTION_SCALE = 1000;

/** Separação (1) e elástico pente (2) — fixos por peça, além do peso do pano. */
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

export function parseConsumptionInput(raw: string) {
  const text = raw.trim().replace(',', '.');
  if (!text) return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
}

export function roundConsumption(value: number) {
  if (!value || value <= 0) return 0;
  return Math.round(value * CONSUMPTION_SCALE) / CONSUMPTION_SCALE;
}

function formatFixedConsumption(value: number) {
  return value.toFixed(3).replace('.', ',');
}

export function formatConsumption(value: number) {
  const rounded = roundConsumption(value);
  if (!rounded) return '';
  return rounded.toFixed(3).replace('.', ',');
}

export function programPartsOnly(parts: PartWeightRow[]) {
  return parts.filter((part) => part.file_name && /\.mdv$/i.test(part.file_name));
}

export function totalPartsWeight(parts: PartWeightRow[]) {
  return parts.reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
}

function partBaseFromFileName(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim().toUpperCase();
}

function partKindToken(value: string) {
  const base = partBaseFromFileName(value) || value.trim().toUpperCase();
  const match = base.match(/-(CT|FT|MG|COSTAS|FRENTE|MANGA|C|F|M)$/i);
  if (!match) return '';
  const token = match[1].toUpperCase();
  if (token === 'C') return 'CT';
  if (token === 'F') return 'FT';
  if (token === 'M') return 'MG';
  if (token === 'FRENTE') return 'FT';
  if (token === 'COSTAS') return 'CT';
  if (token === 'MANGA') return 'MG';
  return token;
}

function partLabelSuffixCompatible(partLabel: string, yarnLabel: string) {
  const a = partLabel.trim().toUpperCase();
  const b = yarnLabel.trim().toUpperCase();
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.endsWith('-M') && b.endsWith('-MG') && a + 'G' === b) return true;
  if (b.endsWith('-M') && a.endsWith('-MG') && b + 'G' === a) return true;
  if (partKindToken(a) && partKindToken(a) === partKindToken(b)) return true;
  if (a.length >= 14 && (b.startsWith(a) || a.startsWith(b))) return true;
  return false;
}

function partFileSuffixCompatible(partFile: string, yarnFile: string) {
  if (!partFile || !yarnFile) return false;
  if (partFile === yarnFile) return true;
  if (partFile.endsWith('-M') && yarnFile.endsWith('-MG') && partFile + 'G' === yarnFile) return true;
  if (yarnFile.endsWith('-M') && partFile.endsWith('-MG') && yarnFile + 'G' === partFile) return true;
  if (partKindToken(partFile) && partKindToken(partFile) === partKindToken(yarnFile)) return true;
  return false;
}

export function partMatchesYarnPart(part: PartWeightRow, yarnPart: YarnPartRow) {
  const partFile = partBaseFromFileName(part.file_name);
  const yarnFile = partBaseFromFileName(yarnPart.file_name);
  if (partFile && yarnFile && partFileSuffixCompatible(partFile, yarnFile)) return true;

  const partLabel = part.label.trim().toUpperCase();
  const yarnLabel = yarnPart.label.trim().toUpperCase();
  if (partLabel && yarnLabel && partLabelSuffixCompatible(partLabel, yarnLabel)) return true;

  const yarnKind = partKindToken(yarnFile || yarnLabel);
  const partKind = partKindToken(partFile || partLabel);
  if (yarnKind && partKind && yarnKind === partKind) return true;

  if (partFile && yarnLabel && (partFile === yarnLabel || partFile.endsWith(`-${yarnLabel}`))) {
    return true;
  }
  if (yarnFile && partLabel && (yarnFile === partLabel || yarnFile.endsWith(`-${partLabel}`))) {
    return true;
  }

  return false;
}

function wastePctOnYarnPart(guides: YarnGuideRow[]) {
  return guides
    .filter((guide) => isProgramFixedWasteYarnGuide(guide.guide))
    .reduce((sum, guide) => sum + (guide.pct ?? 0), 0);
}

function totalWeightForYarnPart(parts: PartWeightRow[], yarnPart: YarnPartRow) {
  return parts.filter((part) => partMatchesYarnPart(part, yarnPart)).reduce(
    (sum, part) => sum + parseConsumptionInput(part.weight_kg),
    0
  );
}

/** Soma pesos do push por .mdv (inclui linhas duplicadas, ex. 2 mangas). */
export function aggregateWeightsByMdvFile(parts: PartWeightRow[]): PartWeightRow[] {
  const totals = new Map<string, { label: string; weight: number }>();

  for (const part of parts) {
    const weight = parseConsumptionInput(part.weight_kg);
    if (weight <= 0) continue;

    const base = partBaseFromFileName(part.file_name);
    if (base) {
      const existing = totals.get(base);
      if (existing) {
        existing.weight += weight;
      } else {
        totals.set(base, { label: part.label, weight });
      }
      continue;
    }

    const kind = partKindToken(part.label);
    if (kind) {
      const key = `__kind__:${kind}`;
      const existing = totals.get(key);
      if (existing) {
        existing.weight += weight;
      } else {
        totals.set(key, { label: part.label, weight });
      }
    }
  }

  return [...totals.entries()].map(([key, row]) => ({
    label: row.label,
    file_name: key.startsWith('__kind__:') ? '' : `${key}.mdv`,
    weight_kg: formatConsumption(row.weight),
  }));
}

export function ensurePartsForYarnParts(
  parts: PartWeightRow[],
  yarnParts: YarnPartRow[]
): PartWeightRow[] {
  const result = [...parts];

  for (const yarnPart of yarnParts) {
    const matched = result.some((part) => partMatchesYarnPart(part, yarnPart));
    if (matched) continue;

    const yarnFile = partBaseFromFileName(yarnPart.file_name);
    const aggregated = aggregateWeightsByMdvFile(parts).find((row) =>
      partMatchesYarnPart(row, yarnPart)
    );

    result.push({
      label: yarnPart.label,
      file_name: yarnPart.file_name,
      weight_kg: aggregated?.weight_kg ?? '',
    });
  }

  return result;
}

export function applyAutoYarnConsumption(
  yarnParts: YarnPartRow[],
  parts: PartWeightRow[] = []
): YarnPartRow[] {
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

function consolidatedYarnKey(guide: Pick<YarnGuideRow, 'guide' | 'letter'>) {
  return `${guide.guide}:${guide.letter.toUpperCase()}`;
}

export function consolidateYarnParts(
  yarnParts: YarnPartRow[],
  parts: PartWeightRow[] = []
): ConsolidatedYarnOutput[] {
  const rows = new Map<string, ConsolidatedYarnOutput & { sum: number; letters: Set<string> }>();
  const totalPartWeight = totalPartsWeight(parts);

  for (const yarnPart of yarnParts) {
    const matchingParts = parts.filter((part) => partMatchesYarnPart(part, yarnPart));
    const multiplier = matchingParts.length || 1;
    const partLabel =
      matchingParts.length > 0
        ? formatPartContribution(matchingParts[0].label, multiplier)
        : formatPartContribution(yarnPart.label, 1);

    for (const guide of yarnPart.guides) {
      const key = consolidatedYarnKey(guide);
      const add = parseConsumptionInput(guide.consumption ?? '');
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

/** Monta pesos por .mdv a partir do push + pasta do programa. */
export function buildWeightPartsFromPush(
  folderParts: { label: string; file_name: string }[],
  pushParts: PartWeightRow[]
): PartWeightRow[] {
  const pushMdv = pushParts.filter((part) => part.file_name && /\.mdv$/i.test(part.file_name));

  const rows: PartWeightRow[] = folderParts.map((folder) => {
    const base = partBaseFromFileName(folder.file_name);
    const weight = pushMdv
      .filter((part) => partFileSuffixCompatible(partBaseFromFileName(part.file_name), base))
      .reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);

    return {
      label: folder.label,
      file_name: folder.file_name,
      weight_kg: weight > 0 ? formatConsumption(weight) : '',
    };
  });

  return ensurePartsForYarnParts(rows, folderParts.map((folder) => ({
    label: folder.label,
    file_name: folder.file_name,
    guides: [],
  })));
}

export function buildConsolidatedFromSinParts(
  sinParts: {
    label: string;
    file_name: string;
    guides: YarnGuideRow[];
  }[],
  weightParts: PartWeightRow[]
): ConsolidatedYarnOutput[] {
  const yarnParts: YarnPartRow[] = sinParts.map((part) => ({
    key: part.label.toUpperCase(),
    label: part.label,
    file_name: part.file_name,
    guides: part.guides.map((guide) => ({
      ...guide,
      consumption: '',
    })),
  }));

  const partsForYarn = ensurePartsForYarnParts(weightParts, yarnParts);
  const computed = applyAutoYarnConsumption(yarnParts, partsForYarn);
  return consolidateYarnParts(computed, partsForYarn);
}
