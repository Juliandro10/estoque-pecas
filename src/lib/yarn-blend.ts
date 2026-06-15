import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import { formatConsumption } from './cadastro-db';
import { resolveYarnRow, type ResolvedYarnRow } from './syntech-yarn-match';
import { expandProcessYarnComponents } from '../../shared/yarn-blend-core';
import { parseYarnDescriptionComponents } from '../../shared/yarn-description-parse';

export type ResolvedProcessYarnRow = ResolvedYarnRow & {
  syntech_slot: number;
  component_index: number;
  blend_source?: string;
  weight_share: number;
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
    rows.map((row) => [`${row.guide}:${(row.letter || 'A').toUpperCase()}`, row])
  );

  const expanded = expandProcessYarnComponents(
    rows.map((row) => ({
      guide: row.guide,
      letter: row.letter,
      description: row.description,
      consumption: row.consumption,
      pct: row.pct,
      tipo_fio_codigo: row.tipo_fio_codigo ?? undefined,
    })),
    partWeightKg && partWeightKg > 0 ? { partWeightKg } : {},
    yarnTypes
  );

  if (expanded.every((row) => row.componentIndex === 0)) {
    return rows.map((row) => resolveYarnRow(row, catalog)).map((row) => ({
      ...row,
      syntech_slot: row.guide,
      component_index: 0,
      weight_share: 1,
    }));
  }

  return expanded.map((component) => {
    const parent =
      byKey.get(`${component.guide}:${(component.letter ?? 'A').toUpperCase()}`) ??
      rows.find((row) => row.guide === component.guide);
    const resolved = resolveYarnRow(
      {
        guide: component.guide,
        letter: component.letter ?? parent?.letter ?? '',
        description: component.description,
        pct: component.pct,
        consumption: formatConsumption(component.consumptionKg),
        parts: parent?.parts ?? [],
        component_index: component.componentIndex,
      },
      catalog
    );

    return {
      ...resolved,
      syntech_slot: component.slot,
      component_index: component.componentIndex,
      blend_source: parent && component.componentIndex > 0 ? parent.description : undefined,
      weight_share: component.weightShare,
    };
  });
}

export function processYarnRowsReadyForSyntech(rows: ResolvedProcessYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
