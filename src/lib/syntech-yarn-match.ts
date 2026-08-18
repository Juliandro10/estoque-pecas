import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import {
  buildCorrectedYarnDescription,
  parseYarnDescription as parseYarnDescriptionCore,
  parseYarnDescriptionComponents,
} from '../../shared/yarn-description-parse';
import {
  findBestColorMatch,
  normalizeSyntechName,
  yarnTypeNamesMatch,
} from '../../shared/syntech-name-match';
import { parseSyntechCodeLead } from '../../shared/syntech-code-parse';

const FIXED_BICO_TIPO_FIO: Record<number, number> = {
  1: 70,
  2: 13,
};

export function parseYarnDescription(description: string, yarnTypes: string[] = []) {
  return parseYarnDescriptionCore(description, yarnTypes);
}

function normalize(value: string) {
  return value.trim().toUpperCase();
}

function findYarnType(catalog: SyntechYarnCatalogFile, tipoText: string) {
  const tipo = tipoText.trim();
  if (!tipo) return null;

  const exact = catalog.types.find((item) => normalize(item.tipo) === normalize(tipo));
  if (exact) return exact;

  return catalog.types.find((item) => yarnTypeNamesMatch(tipo, item.tipo)) ?? null;
}

function colorMatches(cores: string[], cor: string | null) {
  if (!cor) return true;
  return findBestColorMatch(cor, cores) !== null;
}

function allCatalogColors(catalog: SyntechYarnCatalogFile): string[] {
  const seen = new Set<string>();
  const colors: string[] = [];
  for (const type of catalog.types) {
    for (const cor of type.cores) {
      const key = normalizeSyntechName(cor);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      colors.push(cor);
    }
  }
  return colors;
}

function resolveCatalogColor(
  cores: string[],
  cor: string | null,
  catalog?: SyntechYarnCatalogFile | null
) {
  if (!cor) return cor;
  return (
    findBestColorMatch(cor, cores) ??
    (catalog ? findBestColorMatch(cor, allCatalogColors(catalog)) : null) ??
    cor
  );
}

function correctedDescription(
  original: string,
  parsed: ReturnType<typeof parseYarnDescriptionCore>,
  tipoName: string | null,
  corName: string | null
) {
  const next = buildCorrectedYarnDescription(parsed, tipoName, corName).trim();
  if (!next) return original;
  if (normalizeSyntechName(next) === normalizeSyntechName(original)) return original;
  return next;
}

export type ResolvedYarnRow = ConsolidatedYarnRow & {
  tipo_fio_codigo: number | null;
  tipo_fio_nome: string | null;
  cor: string | null;
  codigo_ok: boolean;
  cor_ok: boolean;
};

function findYarnTypeByCodigo(catalog: SyntechYarnCatalogFile, codigo: number) {
  return catalog.types.find((item) => item.codigo === codigo) ?? null;
}

function resolveBySyntechCode(
  row: ConsolidatedYarnRow,
  catalog: SyntechYarnCatalogFile,
  codeLead: { codigo: number; rest: string }
): ResolvedYarnRow | null {
  const match = findYarnTypeByCodigo(catalog, codeLead.codigo);
  if (!match) return null;

  const yarnTypes = catalog.types.map((item) => item.tipo);
  const restParsed = codeLead.rest
    ? parseYarnDescription(codeLead.rest, yarnTypes)
    : { tipo: '', cabo: null, cor: null };
  const cor = resolveCatalogColor(match.cores, restParsed.cor, catalog);
  const description = correctedDescription(
    row.description,
    { ...restParsed, tipo: match.tipo },
    match.tipo,
    cor
  );

  return {
    ...row,
    description,
    tipo_fio_codigo: match.codigo,
    tipo_fio_nome: match.tipo,
    cor,
    codigo_ok: true,
    cor_ok: colorMatches(match.cores, restParsed.cor),
  };
}

export function resolveYarnRow(
  row: ConsolidatedYarnRow,
  catalog: SyntechYarnCatalogFile | null
): ResolvedYarnRow {
  const fixedCodigo = FIXED_BICO_TIPO_FIO[row.guide];
  const yarnTypes = catalog?.types.map((item) => item.tipo) ?? [];
  const parsed = parseYarnDescription(row.description, yarnTypes);
  const codeLead = parseSyntechCodeLead(row.description);

  if (codeLead && catalog && (row.component_index ?? 0) === 0) {
    const byCode = resolveBySyntechCode(row, catalog, codeLead);
    if (byCode) return byCode;
  }

  if (fixedCodigo !== undefined && (row.component_index ?? 0) === 0) {
    const fixedType = catalog?.types.find((item) => item.codigo === fixedCodigo) ?? null;
    const cor = fixedType ? resolveCatalogColor(fixedType.cores, parsed.cor, catalog) : parsed.cor;
    const description = fixedType
      ? correctedDescription(row.description, parsed, fixedType.tipo, cor)
      : row.description;
    return {
      ...row,
      description,
      tipo_fio_codigo: fixedCodigo,
      tipo_fio_nome: fixedType?.tipo ?? null,
      cor,
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
  const cor = match ? resolveCatalogColor(match.cores, parsed.cor, catalog) : parsed.cor;
  const description = match
    ? correctedDescription(row.description, parsed, match.tipo, cor)
    : row.description;
  return {
    ...row,
    description,
    tipo_fio_codigo: match?.codigo ?? null,
    tipo_fio_nome: match?.tipo ?? null,
    cor,
    codigo_ok: Boolean(match),
    cor_ok: match ? colorMatches(match.cores, parsed.cor) : false,
  };
}

export function correctYarnDescription(
  description: string,
  catalog: SyntechYarnCatalogFile | null
) {
  return resolveYarnRow(
    {
      guide: 0,
      letter: '',
      description,
      pct: 0,
      consumption: '',
      parts: [],
    },
    catalog
  ).description;
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
