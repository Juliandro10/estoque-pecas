import { parseWeightKg, queryTx, type SyntechTx } from './syntech-db';
import type { GuiaFioRow } from './syntech-guia-fio';
import { resolveCaboNumberForBico } from './syntech-bico-rules';

const BICO_SLOTS = 10;
const PARTE_NAME_MAX = 15;

type PushPart = {
  label: string;
  file_name: string;
  weight_kg: string;
};

type PushYarn = {
  guide: number;
  description: string;
  consumption: string;
  pct?: number;
};

export type PartesProdRow = {
  parte: string;
  quant: number;
};

export type BicoMaquinaRow = {
  bico: number;
  parte: string;
  tipo_fio: number | null;
  perc: number;
  cabo: number | null;
  peso: number;
};

function roundPerc(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeParteName(label: string) {
  return label.trim().toUpperCase().slice(0, PARTE_NAME_MAX);
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
  guiaRows: GuiaFioRow[]
): Omit<BicoMaquinaRow, 'tipo_fio'>[] {
  const totalPeso = consolidated.reduce((sum, row) => sum + parseWeightKg(row.consumption), 0);
  const byGuide = new Map<number, PushYarn>();

  for (const row of consolidated) {
    if (!byGuide.has(row.guide)) byGuide.set(row.guide, row);
  }

  const rows: Omit<BicoMaquinaRow, 'tipo_fio'>[] = [];

  for (let bico = 1; bico <= BICO_SLOTS; bico++) {
    const yarn = byGuide.get(bico);
    const peso = yarn ? parseWeightKg(yarn.consumption) : 0;
    if (!yarn || peso <= 0) continue;

    const guia = guiaRows.find((row) => row.numero === bico);
    const caboRaw = guia?.cabod ?? guia?.cabo;
    const cabo = resolveCaboNumberForBico(
      bico,
      yarn.description,
      caboRaw
    );

    const perc =
      yarn.pct && yarn.pct > 0
        ? roundPerc(yarn.pct)
        : totalPeso > 0
          ? roundPerc((peso / totalPeso) * 100)
          : 0;

    rows.push({
      bico,
      parte: `BICO ${bico}`,
      perc,
      cabo,
      peso,
    });
  }

  return rows;
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
