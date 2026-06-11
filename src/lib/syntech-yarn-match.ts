import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';

const FIXED_BICO_TIPO_FIO: Record<number, number> = {
  1: 70,
  2: 13,
  8: 70,
};

export function parseYarnDescription(description: string) {
  const text = description.trim();
  const match = text.match(/^(.+?)\s+(\d+)\s+CABO\s+(.+)$/i);
  if (match) {
    return {
      tipo: match[1].trim(),
      cabo: match[2],
      cor: match[3].trim(),
    };
  }
  return { tipo: text, cabo: null as string | null, cor: null as string | null };
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
  const parsed = parseYarnDescription(row.description);

  if (fixedCodigo !== undefined) {
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

export function yarnRowsReadyForSyntech(rows: ResolvedYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
