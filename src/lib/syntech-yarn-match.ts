import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../types-programming';
import {
  buildCorrectedYarnDescription,
  formatYarnComponentDescription,
  parseYarnDescription as parseYarnDescriptionCore,
  parseYarnDescriptionComponents,
} from '../../shared/yarn-description-parse';
import {
  findBestColorMatch,
  findBestYarnTypeMatch,
  normalizeSyntechName,
  suggestClosestColor,
  yarnTypeNamesMatch,
} from '../../shared/syntech-name-match';
import {
  parseSyntechCodeLead,
  stampSyntechCodeLead,
  stripSyntechCodeLead,
} from '../../shared/syntech-code-parse';

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

  const bestName = findBestYarnTypeMatch(
    tipo,
    catalog.types.map((item) => item.tipo)
  );
  if (bestName) return catalog.types.find((item) => item.tipo === bestName) ?? null;

  return catalog.types.find((item) => yarnTypeNamesMatch(tipo, item.tipo)) ?? null;
}

function findYarnTypeByCodigo(catalog: SyntechYarnCatalogFile, codigo: number) {
  return catalog.types.find((item) => item.codigo === codigo) ?? null;
}

type ColorResolution = {
  cor: string | null;
  cor_ok: boolean;
  cor_sugerida: string | null;
};

/** Cor só vale dentro do código. Fora da lista: mantém o texto e marca conferir. */
function resolveTypeColor(cores: string[], cor: string | null): ColorResolution {
  if (!cor) return { cor: null, cor_ok: true, cor_sugerida: null };

  const matched = findBestColorMatch(cor, cores);
  if (matched) return { cor: matched, cor_ok: true, cor_sugerida: null };

  return {
    cor,
    cor_ok: false,
    cor_sugerida: suggestClosestColor(cor, cores),
  };
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

function withCodeLead(original: string, codigo: number | null, next: string) {
  if (codigo == null) return next;
  if (!parseSyntechCodeLead(original) && !parseSyntechCodeLead(next)) return next;
  return stampSyntechCodeLead(next, codigo);
}

export type ResolvedYarnRow = ConsolidatedYarnRow & {
  tipo_fio_codigo: number | null;
  tipo_fio_nome: string | null;
  cor: string | null;
  codigo_ok: boolean;
  cor_ok: boolean;
  cor_sugerida: string | null;
};

function resolveBySyntechCode(
  row: ConsolidatedYarnRow,
  catalog: SyntechYarnCatalogFile,
  codigo: number,
  restDescription: string
): ResolvedYarnRow | null {
  const match = findYarnTypeByCodigo(catalog, codigo);
  if (!match) return null;

  const yarnTypes = catalog.types.map((item) => item.tipo);
  const restParsed = restDescription
    ? parseYarnDescription(restDescription, yarnTypes)
    : { tipo: '', cabo: null, cor: null };
  const color = resolveTypeColor(match.cores, restParsed.cor);
  const description = withCodeLead(
    row.description,
    codigo,
    correctedDescription(
      restDescription || row.description,
      { ...restParsed, tipo: match.tipo },
      match.tipo,
      color.cor_ok ? color.cor : restParsed.cor
    )
  );

  return {
    ...row,
    description,
    tipo_fio_codigo: match.codigo,
    tipo_fio_nome: match.tipo,
    cor: color.cor,
    codigo_ok: true,
    cor_ok: color.cor_ok,
    cor_sugerida: color.cor_sugerida,
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

  if (catalog) {
    if (codeLead) {
      const byCode = resolveBySyntechCode(row, catalog, codeLead.codigo, codeLead.rest);
      if (byCode) return byCode;
    }

    if (row.tipo_fio_codigo != null && row.tipo_fio_codigo > 0) {
      const byRowCode = resolveBySyntechCode(
        row,
        catalog,
        row.tipo_fio_codigo,
        stripSyntechCodeLead(row.description)
      );
      if (byRowCode) return byRowCode;
    }
  }

  if (fixedCodigo !== undefined && (row.component_index ?? 0) === 0) {
    const fixedType = catalog?.types.find((item) => item.codigo === fixedCodigo) ?? null;
    const color = fixedType
      ? resolveTypeColor(fixedType.cores, parsed.cor)
      : { cor: parsed.cor, cor_ok: true, cor_sugerida: null as string | null };
    const description = fixedType
      ? correctedDescription(
          row.description,
          parsed,
          fixedType.tipo,
          color.cor_ok ? color.cor : parsed.cor
        )
      : row.description;
    return {
      ...row,
      description,
      tipo_fio_codigo: fixedCodigo,
      tipo_fio_nome: fixedType?.tipo ?? null,
      cor: color.cor,
      codigo_ok: true,
      cor_ok: color.cor_ok,
      cor_sugerida: color.cor_sugerida,
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
      cor_sugerida: null,
    };
  }

  const match =
    findYarnType(catalog, parsed.tipo) ?? findYarnType(catalog, stripSyntechCodeLead(row.description));
  if (!match) {
    return {
      ...row,
      tipo_fio_codigo: null,
      tipo_fio_nome: null,
      cor: parsed.cor,
      codigo_ok: false,
      cor_ok: false,
      cor_sugerida: null,
    };
  }

  const color = resolveTypeColor(match.cores, parsed.cor);
  const description = correctedDescription(
    row.description,
    parsed,
    match.tipo,
    color.cor_ok ? color.cor : parsed.cor
  );
  return {
    ...row,
    description,
    tipo_fio_codigo: match.codigo,
    tipo_fio_nome: match.tipo,
    cor: color.cor,
    codigo_ok: true,
    cor_ok: color.cor_ok,
    cor_sugerida: color.cor_sugerida,
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

export function applyYarnCodigoToDescription(description: string, codigo: number | null) {
  if (codigo == null || codigo <= 0) return stripSyntechCodeLead(description);
  return stampSyntechCodeLead(description, codigo);
}

export function applyYarnColorToDescription(
  description: string,
  cor: string,
  catalog: SyntechYarnCatalogFile | null,
  codigo?: number | null
) {
  const yarnTypes = catalog?.types.map((item) => item.tipo) ?? [];
  const lead = parseSyntechCodeLead(description);
  const parsed = parseYarnDescription(description, yarnTypes);
  const resolvedCodigo = lead?.codigo ?? (codigo && codigo > 0 ? codigo : null);
  const tipoName =
    resolvedCodigo && catalog
      ? (findYarnTypeByCodigo(catalog, resolvedCodigo)?.tipo ?? parsed.tipo)
      : parsed.tipo;
  const built = buildCorrectedYarnDescription(parsed, tipoName, cor);
  return resolvedCodigo ? stampSyntechCodeLead(built, resolvedCodigo) : built;
}

function storedYarnParts(storedDescription: string, catalog: SyntechYarnCatalogFile | null) {
  const yarnTypes = catalog?.types.map((item) => item.tipo) ?? [];
  const components = parseYarnDescriptionComponents(storedDescription, yarnTypes);
  return components.length > 0 ? components.map((item) => item.raw) : [storedDescription];
}

function joinStoredYarnParts(parts: string[]) {
  return parts.length <= 1 ? (parts[0] ?? '') : parts.join(' + ');
}

/** Grava cor/código no texto original do .sin (não no rótulo já reescrito). */
export function applyYarnColorToStoredDescription(
  storedDescription: string,
  componentIndex: number,
  cor: string,
  catalog: SyntechYarnCatalogFile | null,
  codigo?: number | null
) {
  const parts = storedYarnParts(storedDescription, catalog);
  const index = Math.min(Math.max(componentIndex, 0), Math.max(parts.length - 1, 0));
  parts[index] = applyYarnColorToDescription(parts[index] ?? storedDescription, cor, catalog, codigo);
  return joinStoredYarnParts(parts);
}

export function applyYarnCodigoToStoredDescription(
  storedDescription: string,
  componentIndex: number,
  codigo: number | null,
  catalog: SyntechYarnCatalogFile | null
) {
  const parts = storedYarnParts(storedDescription, catalog);
  const index = Math.min(Math.max(componentIndex, 0), Math.max(parts.length - 1, 0));
  parts[index] = applyYarnCodigoToDescription(parts[index] ?? storedDescription, codigo);
  return joinStoredYarnParts(parts);
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
        description: component.raw || formatYarnComponentDescription(component),
        component_index: index,
      },
      catalog
    )
  );
}

export function yarnRowsReadyForSyntech(rows: ResolvedYarnRow[]) {
  return rows.every((row) => row.codigo_ok);
}
