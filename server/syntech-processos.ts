import { parseWeightKg, queryTx, clipSyntechText, type SyntechTx } from './syntech-db';
import type { GuiaFioRow } from './syntech-guia-fio';
import { expandProcessYarnComponents, type ProcessYarnInput } from './yarn-blend';
import { yarnTypesFromCatalog } from './syntech-yarn-types';

const BICO_SLOTS = 10;
const PARTE_NAME_MAX = 15;

type PushPart = {
  label: string;
  file_name: string;
  weight_kg: string;
};

type PushYarn = ProcessYarnInput;

export type PartesProdRow = {
  parte: string;
  quant: number;
};

export type BicoMaquinaRow = {
  bico: number;
  guide: number;
  parte: string;
  tipo_fio: number | null;
  perc: number;
  cabo: number | null;
  peso: number;
  description: string;
  component_index: number;
};

export type BuildPartesProdOptions = {
  reference?: string;
  folderName?: string;
};

function roundPerc(value: number) {
  return Math.round(value * 100) / 100;
}

const PART_SUFFIX_HEADS = new Set([
  'FT',
  'CT',
  'MG',
  'MN',
  'CORPO',
  'FRENTE',
  'COSTAS',
  'MANGA',
  'PUNHO',
  'GOLA',
]);

/**
 * Sufixo que identifica a peça na OP (CT, MG, FT-D, CORPO-E…).
 * Ignora nomes do meio (CASULO, TRANCAS…) — só o token final de tipo de peça.
 */
export function partIdentitySuffixSegments(segments: string[]) {
  if (segments.length === 0) return [];

  const upper = segments.map((s) => s.toUpperCase());
  const last = upper[upper.length - 1];
  const prev = upper.length >= 2 ? upper[upper.length - 2] : '';

  if ((last === 'D' || last === 'E') && PART_SUFFIX_HEADS.has(prev)) {
    return segments.slice(-2);
  }
  if (PART_SUFFIX_HEADS.has(last)) {
    return segments.slice(-1);
  }
  if (last.length === 1 && segments.length >= 2) {
    return segments.slice(-2);
  }
  return segments.slice(-1);
}

/**
 * Monta REF-PRODUTO-SUFIXO a partir do .mdv (ex.: 5472-CARDIGAN-CASULO-CT → 5472-CARDIGAN-CT).
 */
export function buildParteDisplayName(
  fileName: string,
  reference?: string,
  partLabel?: string
) {
  const base = clipSyntechText(fileName.replace(/\.mdv$/i, ''), 200);
  let segments = base.split('-').filter(Boolean);

  const ref = reference?.trim() ?? '';
  if (ref && segments[0]?.toUpperCase() === ref.toUpperCase()) {
    segments = segments.slice(1);
  }

  if (segments.length === 0) {
    return normalizeParteName(partLabel?.trim() || base);
  }

  const suffixSegs = partIdentitySuffixSegments(segments);
  const suffix = suffixSegs.join('-');
  const beforeSuffix = segments.slice(0, segments.length - suffixSegs.length);

  let product = beforeSuffix[0]?.trim() ?? '';
  if (!product && partLabel) {
    product = partLabel.split('-').filter(Boolean)[0]?.trim() ?? partLabel.trim();
  }

  if (product && suffix) {
    return normalizeParteName(`${product}-${suffix}`);
  }
  return normalizeParteName(base);
}

const TEMPO_PESO_DESCRICAO_MAX = 10;

/** TEMPO_PESO_PROD.DESCRICAO — sufixo da peça (CT, FT, MG, FT-D…). */
export function tempoPesoDescricao(part: { label: string; file_name: string }) {
  if (part.file_name && /\.mdv$/i.test(part.file_name)) {
    const base = clipSyntechText(part.file_name.replace(/\.mdv$/i, ''), 200);
    let segments = base.split('-').filter(Boolean);
    if (segments[0] && /^\d+$/.test(segments[0])) {
      segments = segments.slice(1);
    }
    if (segments.length > 0) {
      const suffix = partIdentitySuffixSegments(segments).join('-');
      if (suffix) {
        return clipSyntechText(suffix, TEMPO_PESO_DESCRICAO_MAX).toUpperCase();
      }
    }
  }
  return clipSyntechText(part.label.trim(), TEMPO_PESO_DESCRICAO_MAX).toUpperCase();
}

/**
 * Syntech PARTE = 15 chars — REF-PRODUTO-SUFIXO; preserva ref e sufixo (CT, FT, MG…).
 */
export function normalizeParteName(raw: string) {
  const ascii = clipSyntechText(raw.trim(), 200);
  if (!ascii) return '';
  if (ascii.length <= PARTE_NAME_MAX) return ascii.toUpperCase();

  const segments = ascii.split('-').filter(Boolean);
  if (segments.length === 0) {
    return ascii.slice(-PARTE_NAME_MAX).toUpperCase();
  }

  const suffixSegs = partIdentitySuffixSegments(segments);
  const suffix = suffixSegs.join('-');
  const headSegs = segments.slice(0, segments.length - suffixSegs.length);

  if (headSegs.length >= 2 && /^\d+$/.test(headSegs[0])) {
    const ref = headSegs[0];
    const product = headSegs.slice(1).join('-');
    const room = PARTE_NAME_MAX - ref.length - suffix.length - 2;
    if (room > 0) {
      const shortProduct = product.length <= room ? product : product.slice(0, room);
      const result = `${ref}-${shortProduct}-${suffix}`;
      if (result.length <= PARTE_NAME_MAX) {
        return result.toUpperCase();
      }
    }
    const minimal = `${ref}-${suffix}`;
    if (minimal.length <= PARTE_NAME_MAX) {
      return minimal.toUpperCase();
    }
  }

  if (headSegs.length >= 1) {
    const product = headSegs.join('-');
    const room = PARTE_NAME_MAX - suffix.length - 1;
    if (room > 0) {
      const shortProduct = product.length <= room ? product : product.slice(-room);
      let prefix = shortProduct;
      if (product.length > room) {
        const dashIdx = prefix.indexOf('-');
        if (dashIdx >= 0) {
          prefix = prefix.slice(dashIdx + 1);
        }
      }
      if (prefix) {
        const result = `${prefix}-${suffix}`;
        if (result.length <= PARTE_NAME_MAX) {
          return result.toUpperCase();
        }
      }
    }
  }

  if (suffix.length <= PARTE_NAME_MAX) {
    return suffix.toUpperCase();
  }
  return suffix.slice(-PARTE_NAME_MAX).toUpperCase();
}

function parteNameFromPushPart(part: PushPart, options: BuildPartesProdOptions = {}) {
  if (part.file_name && /\.mdv$/i.test(part.file_name)) {
    return buildParteDisplayName(part.file_name, options.reference, part.label);
  }
  return normalizeParteName(part.label.trim());
}

export function buildPartesProdRows(
  parts: PushPart[],
  options: BuildPartesProdOptions = {}
): PartesProdRow[] {
  const counts = new Map<string, PartesProdRow>();

  for (const part of parts) {
    if (!part.file_name || !/\.mdv$/i.test(part.file_name)) continue;
    const key = part.file_name.trim().toLowerCase();
    const parte = parteNameFromPushPart(part, options);
    if (!parte) continue;

    const existing = counts.get(key);
    if (existing) {
      existing.quant += 1;
      continue;
    }

    counts.set(key, { parte, quant: 1 });
  }

  return [...counts.values()].sort((a, b) => a.parte.localeCompare(b.parte, 'pt-BR'));
}

export function buildBicoMaquinaRows(
  consolidated: PushYarn[],
  guiaRows: GuiaFioRow[],
  partWeightKg?: number
): Omit<BicoMaquinaRow, 'tipo_fio'>[] {
  const expanded = expandProcessYarnComponents(
    consolidated,
    guiaRows,
    yarnTypesFromCatalog(),
    undefined,
    partWeightKg
  );

  return expanded.map((row) => ({
    bico: row.slot,
    guide: row.guide,
    parte: `BICO ${row.guide}`,
    perc: row.pct,
    cabo: row.cabo,
    peso: row.consumptionKg,
    description: row.description,
    component_index: row.componentIndex,
  }));
}

export async function pushPartesProd(
  tx: SyntechTx,
  reference: string,
  rows: PartesProdRow[]
) {
  await queryTx(tx, 'DELETE FROM PARTES_PROD WHERE COD_PROD = ?', [reference]);

  let inserted = 0;
  let autoinc = 1;
  for (const row of rows) {
    await queryTx(
      tx,
      'INSERT INTO PARTES_PROD (COD_PROD, AUTOINC, PARTE, QUANT) VALUES (?, ?, ?, ?)',
      [reference, autoinc, row.parte, row.quant]
    );
    autoinc += 1;
    inserted += 1;
  }

  return inserted;
}

export async function pushBicosMaquina(
  tx: SyntechTx,
  reference: string,
  rows: BicoMaquinaRow[]
) {
  const sets: string[] = [];
  const params: unknown[] = [];

  for (let n = 1; n <= BICO_SLOTS; n++) {
    const row = rows.find((item) => item.bico === n);
    sets.push(`PARTE${n} = ?`, `TIPO_FIO${n} = ?`, `PERC${n} = ?`, `CABO${n} = ?`, `PESO${n} = ?`);
    params.push(
      row?.parte ?? null,
      row?.tipo_fio ?? null,
      row?.perc ?? null,
      row?.cabo ?? null,
      row?.peso ?? null
    );
  }

  await queryTx(tx, `UPDATE PRODUTOS SET ${sets.join(', ')} WHERE CODIGO = ?`, [...params, reference]);

  return rows.filter((row) => row.tipo_fio !== null).length;
}

function roundKg(value: number) {
  return Math.round(value * 1000) / 1000;
}

export async function pushPesoBrutoProduto(
  tx: SyntechTx,
  reference: string,
  parts: PushPart[],
  partWeightKg?: number
) {
  const peso =
    partWeightKg && partWeightKg > 0
      ? roundKg(partWeightKg)
      : roundKg(
          parts
            .filter((part) => part.file_name && /\.mdv$/i.test(part.file_name))
            .reduce((sum, part) => sum + parseWeightKg(part.weight_kg), 0)
        );
  if (peso <= 0) return false;

  await queryTx(tx, 'UPDATE PRODUTOS SET PESO = ? WHERE CODIGO = ?', [peso, reference]);
  return true;
}
