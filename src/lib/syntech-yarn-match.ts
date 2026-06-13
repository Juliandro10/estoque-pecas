import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import { parseYarnDescription as parseYarnDescriptionCore } from '../../shared/yarn-description-parse';
import { parseYarnDescriptionComponents } from '../../shared/yarn-description-parse';

const FIXED_BICO_TIPO_FIO: Record<number, number> = {
  1: 70,
  2: 13,
  8: 70,
};

export function parseYarnDescription(description: string, yarnTypes: string[] = []) {
  return parseYarnDescriptionCore(description, yarnTypes);
}

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function findYarnType(catalog: SyntechYarnCatalogFile, tipoText: string) {
  const tipo = normalize(tipoText);
  if (!tipo) return null;

  const exact = catalog.types.find((item) => normalize(item.tipo) === tipo);
  if (exact) return exact;

  let best: (typeof catalog.types)[number] | null = null;
  let bestLen = 0;
  for (const item of catalog.types) {
    const token = normalize(item.tipo);
    if (!token) continue;
    if (!tipo.includes(token) && !token.includes(tipo)) continue;
    if (token.length > bestLen) {
      best = item;
      bestLen = token.length;
    }
  }
  return best;
}

function colorMatches(cores: string[], cor: string | null) {
  if (!cor) return true;
  const target = normalize(cor);
  return cores.some((item) => {
    const name = normalize(item);
    return name === target || target.includes(name) || name.includes(target);
  });
}

export type ResolvedYarnRow = ConsolidatedYarnRow & {
  tipo_fio_codigo: number | null;
  tipo_fio_nome: string | null;
  cor: string | null;
  codigo_ok: boolean;
  cor_ok: boolean;
};

export function resolveYarnRow(
  row: ConsolidatedYarnRow,
  catalog: SyntechYarnCatalogFile | null
): ResolvedYarnRow {
  const fixedCodigo = FIXED_BICO_TIPO_FIO[row.guide];
  const yarnTypes = catalog?.types.map((item) => item.tipo) ?? [];
  const parsed = parseYarnDescription(row.description, yarnTypes);

  if (fixedCodigo !== undefined && (row.component_index ?? 0) === 0) {
    const fixedType = catalog?.types.find((item) => item.codigo === fixedCodigo) ?? null;
    return {
      ...row,
      tipo_fio_codigo: fixedCodigo,
      tipo_fio_nome: fixedType?.tipo ?? null,
      cor: parsed.cor,
      codigo_ok: true,
      cor_ok: fixedType ? colorMatches(fixedType.cores, parsed.cor) : true,
    };
  }

  if (!catalog || catalog.types.length === 0) {
    return {
      ...row,
      tipo_fio_codigo: null,
      tipo_fio_nome: null,
      cor: parsed.cor,
      codigo_ok: false,
      cor_ok: false,
    };
  }

  const match = findYarnType(catalog, parsed.tipo);
  return {
    ...row,
    tipo_fio_codigo: match?.codigo ?? null,
    tipo_fio_nome: match?.tipo ?? null,
    cor: parsed.cor,
    codigo_ok: Boolean(match),
    cor_ok: match ? colorMatches(match.cores, parsed.cor) : false,
  };
}

export function resolveConsolidatedYarns(
  rows: ConsolidatedYarnRow[],
  catalog: SyntechYarnCatalogFile | null
) {
  return rows.map((row) => resolveYarnRow(row, catalog));
}

export function resolveBlendedComponents(
  row: ConsolidatedYarnRow,
  catalog: SyntechYarnCatalogFile | null
) {
  const yarnTypes = catalog?.types.map((item) => item.tipo) ?? [];
  const components = parseYarnDescriptionComponents(row.description, yarnTypes);
  if (components.length <= 1) return [resolveYarnRow(row, catalog)];

  return components.map((component, index) =>
    resolveYarnRow(
      {
        ...row,
        description: `${component.tipo}${component.cor ? ` ${component.cor}` : ''}${component.cabo ? ` ${component.cabo} CABO` : ''}`.trim(),
        component_index: index,
      },
      catalog
    )
  );
}

export function yarnRowsReadyForSyntech(rows: ResolvedYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
