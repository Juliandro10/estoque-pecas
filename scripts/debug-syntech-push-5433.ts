import fs from 'node:fs';
import path from 'node:path';

import {
  attachSyntechDb,
  detachDb,
  formatSyntechTempo,
  parseWeightKg,
  queryTx,
  runInTransaction,
  tempoToTempom,
} from '../server/syntech-db.ts';
import { buildGuiaFioRows } from '../server/syntech-guia-fio.ts';
import {
  buildBicoMaquinaRows,
  buildPartesProdRows,
  pushBicosMaquina,
  pushPartesProd,
  pushPesoBrutoProduto,
} from '../server/syntech-processos.ts';
import { expandProcessYarnComponents, setYarnWeightFactors } from '../server/yarn-blend.ts';
import { yarnTypesFromCatalog } from '../server/syntech-yarn-types.ts';
import { resolvePrograma } from '../server/sin-read.ts';
import { readSinTextsForModel } from '../server/sin-read.ts';

const reference = '5433';
const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const parts = [
  {
    label: 'BLUSA-TRANCAS-CT',
    file_name: '5433-BLUSA-TRANCAS-CT.mdv',
    time_mmss: '07:58',
    weight_kg: '0,200',
  },
  {
    label: 'BLUSA-TRANCAS-FT',
    file_name: '5433-BLUSA-TRANCAS-FT.mdv',
    time_mmss: '07:58',
    weight_kg: '0,200',
  },
  {
    label: 'BLUSA-TRANCAS-MG',
    file_name: '5433-BLUSA-TRANCAS-MG.mdv',
    time_mmss: '05:42',
    weight_kg: '0,200',
  },
];

const consolidated_yarns = [
  { guide: 1, letter: 'A', description: 'SEPARACAO', consumption: '0,020', pct: 0, tipo_fio_codigo: 70 },
  { guide: 2, letter: 'B', description: 'ELASTICO PENTE', consumption: '0,010', pct: 0, tipo_fio_codigo: 13 },
  {
    guide: 3,
    letter: 'C',
    description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
    consumption: '0,248',
    pct: 44.44,
    tipo_fio_codigo: 60,
  },
  {
    guide: 6,
    letter: 'D',
    description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
    consumption: '0,024',
    pct: 4.3,
    tipo_fio_codigo: 60,
  },
  {
    guide: 7,
    letter: 'E',
    description: 'ELASTANO BRANCO 3 CABOS + LINHA SNOW 1 CABO',
    consumption: '0,013',
    pct: 2.33,
  },
];

try {
  const file = path.join(process.cwd(), 'data', 'yarn-weight-factors.json');
  setYarnWeightFactors(JSON.parse(fs.readFileSync(file, 'utf8')));
} catch {
  // defaults
}

const guiaRows = buildGuiaFioRows(
  modelFolder,
  parts.map((p) => p.file_name)
);
const bicoRows = buildBicoMaquinaRows(consolidated_yarns, guiaRows).map((row, index) => ({
  ...row,
  tipo_fio: [70, 13, 60, 1, 60, 1, 1, 1][index] ?? 1,
}));

async function step(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    console.log('OK', name);
  } catch (err) {
    console.error('FAIL', name, err instanceof Error ? err.message : err);
    throw err;
  }
}

const db = await attachSyntechDb();
try {
  await runInTransaction(db, async (tx) => {
    await step('TEMPO 1', async () => {
      const part = parts[0];
      await queryTx(
        tx,
        `UPDATE TEMPO_PESO_PROD SET DESCRICAO = ?, TEMPO = ?, PESO = ?, TEMPOM = ? WHERE PRODUTO = ? AND NUMERO = ?`,
        [
          part.label.slice(0, 10).toUpperCase(),
          formatSyntechTempo(part.time_mmss),
          parseWeightKg(part.weight_kg),
          tempoToTempom(formatSyntechTempo(part.time_mmss)),
          reference,
          1,
        ]
      );
    });

    await step('MAT_PRIMA delete', async () => {
      await queryTx(tx, 'DELETE FROM MAT_PRIMA_PROD WHERE COD_PROD = ? AND TAMANHO = ?', [
        reference,
        '*',
      ]);
    });

    await step('MAT_PRIMA insert LINHA', async () => {
      await queryTx(
        tx,
        `INSERT INTO MAT_PRIMA_PROD (COD_PROD, COD_MAT_PRIMA, QUANT, CUSTO_UNIT, TAMANHO, UNIDADE, PESO)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [reference, 1, 0.081, 0, '*', 'KG', 0.081]
      );
    });

    await step('PARTES_PROD', async () => {
      const rows = buildPartesProdRows(parts);
      console.log('  partes', rows);
      await pushPartesProd(tx, reference, rows);
    });

    await step('PESO bruto', async () => {
      await pushPesoBrutoProduto(tx, reference, parts);
    });

    await step('PROGRAMA', async () => {
      const programa = resolvePrograma(modelFolder)!;
      console.log('  programa', programa, 'len', programa.length);
      await queryTx(tx, 'UPDATE PRODUTOS SET PROGRAMA = ? WHERE CODIGO = ?', [programa, reference]);
    });

    await step('GUIA_FIO row 3', async () => {
      const row = guiaRows.find((r) => r.numero === 3)!;
      console.log('  guia3', row);
      await queryTx(
        tx,
        `UPDATE GUIA_FIO SET ESQUERDA = ?, CABO = ?, DIREITA = ?, CABOD = ?, COR_DO_FIO = ?
         WHERE PRODUTO = ? AND NUMERO = ?`,
        [
          row.esquerda,
          row.cabo,
          row.direita,
          row.cabod,
          row.cor_do_fio,
          reference,
          row.numero,
        ]
      );
    });

    await step('BICOS maquina', async () => {
      console.log('  bicos', bicoRows);
      await pushBicosMaquina(tx, reference, bicoRows);
    });

    throw new Error('rollback intentional');
  });
} catch (err) {
  if (err instanceof Error && err.message === 'rollback intentional') {
    console.log('\nAll steps passed (rolled back).');
  } else {
    console.error('\nStopped:', err instanceof Error ? err.message : err);
  }
} finally {
  await detachDb(db);
}

console.log('\nexpanded', expandProcessYarnComponents(consolidated_yarns, guiaRows, yarnTypesFromCatalog()));
