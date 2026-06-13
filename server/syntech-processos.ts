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
  /** Slot PRODUTOS (Bico3, Bico4… ou 9/10 overflow). */
  bico: number;
  /** Guia-fio físico da máquina (PARTE = BICO N). */
  guide: number;
  parte: string;
  tipo_fio: number | null;
  perc: number;
  cabo: number | null;
  peso: number;
  description: string;
  component_index: number;
};

function roundPerc(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeParteName(label: string) {
  return clipSyntechText(label, PARTE_NAME_MAX).toUpperCase();
}

export function buildPartesProdRows(parts: PushPart[]): PartesProdRow[] {
  const counts = new Map<string, number>();

  for (const part of parts) {
    if (!part.file_name || !/\.mdv$/i.test(part.file_name)) continue;
    const label = normalizeParteName(part.label);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return [...counts.entries()].map(([parte, quant]) => ({ parte, quant }));
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

export async function pushPesoBrutoProduto(tx: SyntechTx, reference: string, parts: PushPart[]) {
  const peso = roundPerc(parts.reduce((sum, part) => sum + parseWeightKg(part.weight_kg), 0));
  if (peso <= 0) return false;

  await queryTx(tx, 'UPDATE PRODUTOS SET PESO = ? WHERE CODIGO = ?', [peso, reference]);
  return true;
}
