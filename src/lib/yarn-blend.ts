import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import { formatConsumption, yarnFioIdentityKey } from './cadastro-db';
import { resolveYarnRow, type ResolvedYarnRow } from './syntech-yarn-match';
import { expandProcessYarnComponents } from '../../shared/yarn-blend-core';
import { parseYarnDescriptionComponents } from '../../shared/yarn-description-parse';
import { bicoProcessoLabel } from '../../shared/guia-fio-text';

export type ResolvedProcessYarnRow = ResolvedYarnRow & {
  syntech_slot: number;
  component_index: number;
  blend_source?: string;
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

  return expanded.map((component) => {
    const parent =
      byKey.get(`${component.guide}:${yarnFioIdentityKey(component.consolidatedDescription)}`) ??
      rows.find((row) => row.guide === component.guide);
    const resolved = resolveYarnRow(
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

    return {
      ...resolved,
      side: component.side ?? parent?.side,
      syntech_slot: component.slot,
      component_index: component.componentIndex,
      blend_source: parent && component.componentIndex > 0 ? parent.description : undefined,
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
}

export function processYarnRowsReadyForSyntech(rows: ResolvedProcessYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
