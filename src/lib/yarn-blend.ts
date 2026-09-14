import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import { formatConsumption, parseConsumptionInput, yarnFioIdentityKey } from './cadastro-db';
import { resolveYarnRow, type ResolvedYarnRow } from './syntech-yarn-match';
import {
  expandProcessYarnComponents,
  parseCabosForWeightShare,
  yarnWeightFactorFromDescription,
} from '../../shared/yarn-blend-core';
import { parseYarnDescriptionComponents } from '../../shared/yarn-description-parse';
import { bicoProcessoLabel } from '../../shared/guia-fio-text';

export type ResolvedProcessYarnRow = ResolvedYarnRow & {
  syntech_slot: number;
  component_index: number;
  blend_source?: string;
  /** Texto original do guia (.sin), inclusive mistura A + B. */
  stored_description: string;
  weight_share: number;
  processo_label: string;
};

function yarnTypesFromCatalog(catalog: SyntechYarnCatalogFile | null) {
  return catalog?.types.map((item) => item.tipo) ?? [];
}

export function isBlendedYarnDescription(
  description: string,
  catalog: SyntechYarnCatalogFile | null = null
) {
  return parseYarnDescriptionComponents(description, yarnTypesFromCatalog(catalog)).length > 1;
}

export function expandConsolidatedForProcessos(
  rows: ConsolidatedYarnRow[],
  catalog: SyntechYarnCatalogFile | null,
  partWeightKg?: number
): ResolvedProcessYarnRow[] {
  const yarnTypes = yarnTypesFromCatalog(catalog);
  const byKey = new Map(
    rows.map((row) => [`${row.guide}:${yarnFioIdentityKey(row.description)}`, row])
  );

  const expanded = expandProcessYarnComponents(
    rows.map((row) => ({
      guide: row.guide,
      letter: row.letter,
      description: row.description,
      consumption: row.consumption,
      pct: row.pct,
      tipo_fio_codigo: row.tipo_fio_codigo ?? undefined,
      side: row.side,
      parts: row.parts,
    })),
    partWeightKg && partWeightKg > 0 ? { partWeightKg } : {},
    yarnTypes
  );

  const labelSiblings = expanded.map((component) => ({
    guide: component.guide,
    slot: component.slot,
    letter: component.letter,
    side: component.side,
    parts: component.parts,
    componentIndex: component.componentIndex,
  }));

  const resolved = expanded.map((component) => {
    const parent =
      byKey.get(`${component.guide}:${yarnFioIdentityKey(component.consolidatedDescription)}`) ??
      rows.find((row) => row.guide === component.guide);
    const matched = resolveYarnRow(
      {
        guide: component.guide,
        letter: component.letter ?? parent?.letter ?? '',
        description: component.description,
        pct: component.pct,
        consumption: formatConsumption(component.consumptionKg),
        parts: parent?.parts ?? [],
        side: component.side ?? parent?.side,
        component_index: component.componentIndex,
      },
      catalog
    );

    const storedDescription = component.consolidatedDescription || parent?.description || component.description;
    return {
      ...matched,
      side: component.side ?? parent?.side,
      syntech_slot: component.slot,
      component_index: component.componentIndex,
      stored_description: storedDescription,
      blend_source:
        storedDescription && storedDescription !== component.description ? storedDescription : undefined,
      weight_share: component.weightShare,
      processo_label: bicoProcessoLabel(
        {
          guide: component.guide,
          slot: component.slot,
          letter: component.letter,
          side: component.side ?? parent?.side,
          parts: component.parts ?? parent?.parts,
          componentIndex: component.componentIndex,
        },
        labelSiblings
      ),
    };
  });

  return reweightProcessoBlends(resolved, partWeightKg);
}

function blendFactor(row: ResolvedProcessYarnRow) {
  const blob = [
    row.tipo_fio_codigo === 24 ? 'FIO LANTEJOULA' : '',
    row.tipo_fio_nome ?? '',
    row.description,
  ].join(' ');
  const cabos = parseCabosForWeightShare(row.guide, row.description);
  return cabos * yarnWeightFactorFromDescription(blob);
}

/** Depois do catálogo (nome/código 24), rateia a mistura no mesmo bico+letra. */
function reweightProcessoBlends(
  rows: ResolvedProcessYarnRow[],
  partWeightKg?: number
): ResolvedProcessYarnRow[] {
  const next = rows.map((row) => ({ ...row }));
  const groups = new Map<string, number[]>();
  next.forEach((row, index) => {
    const key = `${row.guide}:${(row.letter ?? '').toUpperCase()}`;
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  });

  for (const indices of groups.values()) {
    if (indices.length < 2) continue;
    const siblings = indices.map((index) => next[index]);
    if (!siblings.some((row) => (row.component_index ?? 0) > 0)) continue;

    const weights = siblings.map((row) => blendFactor(row));
    const weightSum = weights.reduce((sum, value) => sum + value, 0);
    const totalKg = siblings.reduce((sum, row) => sum + parseConsumptionInput(row.consumption), 0);
    if (weightSum <= 0 || totalKg <= 0) continue;

    indices.forEach((index, i) => {
      const kg = Math.round((totalKg * weights[i] / weightSum) * 1000) / 1000;
      next[index] = {
        ...next[index],
        consumption: formatConsumption(kg),
        pct:
          partWeightKg && partWeightKg > 0
            ? Math.round((kg / partWeightKg) * 10000) / 100
            : next[index].pct,
        weight_share: weights[i] / weightSum,
      };
    });
  }

  return next;
}

export function processYarnRowsReadyForSyntech(rows: ResolvedProcessYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
