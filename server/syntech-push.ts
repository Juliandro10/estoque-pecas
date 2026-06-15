import fs from 'node:fs';
import path from 'node:path';

import {
  attachSyntechDb,
  detachDb,
  formatSyntechTempo,
  parseWeightKg,
  queryDb,
  queryTx,
  runInTransaction,
  tempoToTempom,
  type SyntechTx,
} from './syntech-db';
import { resolveMaquinaForModel } from './sin-machine';
import { readSinTextsForModel, resolvePrograma } from './sin-read';
import {
  buildGuiaFioRows,
  type GuiaFioRow,
} from './syntech-guia-fio';
import {
  buildBicoMaquinaRows,
  buildPartesProdRows,
  pushBicosMaquina,
  pushPartesProd,
  pushPesoBrutoProduto,
  tempoPesoDescricao,
  type BicoMaquinaRow,
} from './syntech-processos';
import { FIXED_BICO_TIPO_FIO } from './syntech-bico-rules';
import { expandProcessYarnComponents, setYarnWeightFactors, type ProcessYarnComponent } from './yarn-blend';
import { yarnTypesFromCatalog, resolveTipoFioCodigoFromCatalog } from './syntech-yarn-types';
import { recalculateConsolidatedYarns } from './yarn-consolidate';

const SLOT_COUNT = 8;
const DEFAULT_TAMANHO = '*';

function loadWeightFactorsFromDisk() {
  try {
    const file = path.join(process.cwd(), 'data', 'yarn-weight-factors.json');
    setYarnWeightFactors(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    // defaults em yarn-blend.ts
  }
}

export type SyntechPushPart = {
  label: string;
  file_name: string;
  time_mmss: string;
  weight_kg: string;
};

export type SyntechPushYarn = {
  guide: number;
  letter: string;
  description: string;
  consumption: string;
  pct?: number;
  tipo_fio_codigo?: number;
};

export type SyntechPushInput = {
  reference: string;
  parts: SyntechPushPart[];
  consolidated_yarns?: SyntechPushYarn[];
  model_folder?: string;
  maquina?: number;
};

export type SyntechPushResult = {
  ok: boolean;
  reference: string;
  product_name?: string;
  tempo_rows: number;
  mat_prima_rows: number;
  maquina?: number;
  maquina_cms?: string;
  maquina_gauge?: string;
  programa?: string;
  guia_fio_rows: number;
  partes_prod_rows: number;
  bicos_maquina_rows: number;
  warnings: string[];
};

async function productExists(tx: SyntechTx, reference: string) {
  const rows = await queryTx<{ CODIGO: string; NOME: string }>(
    tx,
    'SELECT CODIGO, NOME FROM PRODUTOS WHERE CODIGO = ?',
    [reference.trim()]
  );
  return rows[0] ?? null;
}

async function upsertTempoPesoRow(
  tx: SyntechTx,
  reference: string,
  numero: number,
  part: SyntechPushPart | undefined
) {
  const existing = await queryTx(
    tx,
    'SELECT NUMERO FROM TEMPO_PESO_PROD WHERE PRODUTO = ? AND NUMERO = ?',
    [reference, numero]
  );

  if (part?.time_mmss && part.weight_kg && parseWeightKg(part.weight_kg) > 0) {
    const descricao = tempoPesoDescricao(part);
    const tempo = formatSyntechTempo(part.time_mmss);
    const peso = parseWeightKg(part.weight_kg);
    const tempom = tempoToTempom(tempo);

    if (existing.length > 0) {
      await queryTx(
        tx,
        `UPDATE TEMPO_PESO_PROD
         SET DESCRICAO = ?, TEMPO = ?, PESO = ?, TEMPOM = ?
         WHERE PRODUTO = ? AND NUMERO = ?`,
        [descricao, tempo, peso, tempom, reference, numero]
      );
    } else {
      await queryTx(
        tx,
        `INSERT INTO TEMPO_PESO_PROD (PRODUTO, NUMERO, DESCRICAO, TEMPO, PESO, TEMPOM)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [reference, numero, descricao, tempo, peso, tempom]
      );
    }
    return true;
  }

  if (existing.length > 0) {
    await queryTx(
      tx,
      `UPDATE TEMPO_PESO_PROD
       SET DESCRICAO = ?, TEMPO = NULL, PESO = NULL, TEMPOM = 0
       WHERE PRODUTO = ? AND NUMERO = ?`,
      [' ', reference, numero]
    );
  }

  return false;
}

async function findTipoFioCodigo(
  tx: SyntechTx,
  description: string
): Promise<{ codigo: number; nome: string; preco: number } | null> {
  const desc = description.trim();
  if (!desc) return null;

  const fromCatalog = resolveTipoFioCodigoFromCatalog(desc);
  if (fromCatalog != null) {
    const row = await getTipoFioByCodigo(tx, fromCatalog);
    if (row) return row;
  }

  const descUpper = desc.toUpperCase();

  const rules: [string, string][] = [
    ['POWER BRIGHT', 'POWER BRIGHT'],
    ['CAPRICE', 'CAPRICE'],
    ['ELAST', 'ELAST'],
    ['LASTEX', 'LASTEX'],
    ['LINHA', 'LINHA'],
    ['SIENA', 'SIENA'],
  ];

  for (const [, token] of rules) {
    if (!descUpper.includes(token)) continue;
    const rows = await queryTx<{ CODIGO: number; NOME: string; PRECO: number }>(
      tx,
      `SELECT FIRST 1 CODIGO, NOME, PRECO
       FROM TIPO_FIO
       WHERE UPPER(NOME) CONTAINING ?
       ORDER BY CHAR_LENGTH(NOME) DESC, CODIGO`,
      [token]
    );
    if (rows[0]) {
      return { codigo: rows[0].CODIGO, nome: rows[0].NOME, preco: Number(rows[0].PRECO ?? 0) };
    }
  }

  const words = descUpper.split(/\s+/).filter((word) => word.length >= 4);
  for (let size = words.length; size >= 1; size--) {
    for (let start = 0; start <= words.length - size; start++) {
      const phrase = words.slice(start, start + size).join(' ');
      const rows = await queryTx<{ CODIGO: number; NOME: string; PRECO: number }>(
        tx,
        `SELECT FIRST 1 CODIGO, NOME, PRECO
         FROM TIPO_FIO
         WHERE UPPER(NOME) CONTAINING ?
         ORDER BY CHAR_LENGTH(NOME) DESC, CODIGO`,
        [phrase]
      );
      if (rows[0]) {
        return { codigo: rows[0].CODIGO, nome: rows[0].NOME, preco: Number(rows[0].PRECO ?? 0) };
      }
    }
  }

  return null;
}

async function getTipoFioByCodigo(tx: SyntechTx, codigo: number) {
  const rows = await queryTx<{ CODIGO: number; NOME: string; PRECO: number }>(
    tx,
    'SELECT CODIGO, NOME, PRECO FROM TIPO_FIO WHERE CODIGO = ?',
    [codigo]
  );
  if (!rows[0]) return null;
  return {
    codigo: rows[0].CODIGO,
    nome: rows[0].NOME,
    preco: Number(rows[0].PRECO ?? 0),
  };
}

async function findTipoFioForBico(
  tx: SyntechTx,
  physicalGuide: number,
  description: string,
  guia?: GuiaFioRow,
  useFixedRules = true
) {
  const fixedCodigo = useFixedRules ? FIXED_BICO_TIPO_FIO[physicalGuide] : undefined;
  if (fixedCodigo !== undefined) {
    return getTipoFioByCodigo(tx, fixedCodigo);
  }

  const tipoHint = guia?.direita?.trim() || guia?.esquerda?.trim();
  if (tipoHint) {
    const fromGuia = await findTipoFioCodigo(tx, tipoHint);
    if (fromGuia) return fromGuia;
  }

  const fromDescription = await findTipoFioCodigo(tx, description);
  if (fromDescription) return fromDescription;

  return null;
}

async function resolveTipoFioForComponent(
  tx: SyntechTx,
  component: ProcessYarnComponent,
  guia?: GuiaFioRow
) {
  if (component.tipo_fio_codigo != null && component.tipo_fio_codigo > 0) {
    const fromCodigo = await getTipoFioByCodigo(tx, component.tipo_fio_codigo);
    if (fromCodigo) return fromCodigo;
  }

  return findTipoFioForBico(
    tx,
    component.guide,
    component.description,
    guia,
    component.isPrimary
  );
}

async function resolveTipoFioForYarn(
  tx: SyntechTx,
  row: SyntechPushYarn,
  guia?: GuiaFioRow
) {
  if (row.tipo_fio_codigo != null && row.tipo_fio_codigo > 0) {
    const fromCodigo = await getTipoFioByCodigo(tx, row.tipo_fio_codigo);
    if (fromCodigo) return fromCodigo;
  }
  return findTipoFioForBico(tx, row.guide, row.description, guia);
}

async function pushMatPrima(
  tx: SyntechTx,
  reference: string,
  consolidated: SyntechPushYarn[],
  guiaRows: GuiaFioRow[],
  warnings: string[],
  partWeightKg: number
) {
  if (consolidated.length === 0) return 0;

  await queryTx(tx, 'DELETE FROM MAT_PRIMA_PROD WHERE COD_PROD = ? AND TAMANHO = ?', [
    reference,
    DEFAULT_TAMANHO,
  ]);

  const merged = new Map<number, { quant: number; preco: number; nome: string }>();

  const expanded = expandProcessYarnComponents(
    consolidated,
    guiaRows,
    yarnTypesFromCatalog(),
    undefined,
    partWeightKg
  );

  for (const row of expanded) {
    const quant = row.consumptionKg;
    if (quant <= 0) continue;

    const guia = guiaRows.find((item) => item.numero === row.guide);
    const match = await resolveTipoFioForComponent(tx, row, guia);
    if (!match) {
      warnings.push(
        `Fio bico ${row.guide} slot ${row.slot} (${row.description}) — sem código em TIPO_FIO`
      );
      continue;
    }

    const existing = merged.get(match.codigo);
    if (existing) {
      existing.quant += quant;
    } else {
      merged.set(match.codigo, { quant, preco: match.preco, nome: match.nome });
    }
  }

  let inserted = 0;
  for (const [codMatPrima, row] of merged) {
    await queryTx(
      tx,
      `INSERT INTO MAT_PRIMA_PROD (COD_PROD, COD_MAT_PRIMA, QUANT, CUSTO_UNIT, TAMANHO, UNIDADE, PESO)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [reference, codMatPrima, row.quant, row.preco, DEFAULT_TAMANHO, 'KG', row.quant]
    );
    inserted += 1;
  }

  return inserted;
}

async function resolveBicosMaquina(
  tx: SyntechTx,
  consolidated: SyntechPushYarn[],
  guiaRows: GuiaFioRow[],
  warnings: string[],
  partWeightKg: number
): Promise<BicoMaquinaRow[]> {
  const baseRows = buildBicoMaquinaRows(consolidated, guiaRows, partWeightKg);
  const expanded = expandProcessYarnComponents(
    consolidated,
    guiaRows,
    yarnTypesFromCatalog(),
    undefined,
    partWeightKg
  );
  const resolved: BicoMaquinaRow[] = [];

  for (const row of baseRows) {
    const component = expanded.find(
      (item) => item.slot === row.bico && item.guide === row.guide && item.componentIndex === row.component_index
    );
    const guia = guiaRows.find((item) => item.numero === row.guide);
    const match = component ? await resolveTipoFioForComponent(tx, component, guia) : null;
    if (!match) {
      warnings.push(
        `Bico slot ${row.bico} / guia ${row.guide} (${row.description}) — sem TIPO_FIO para matéria-prima máquina`
      );
      continue;
    }
    resolved.push({ ...row, tipo_fio: match.codigo });
  }

  return resolved;
}

async function pushMaquina(tx: SyntechTx, reference: string, maquina: number) {
  await queryTx(tx, 'UPDATE PRODUTOS SET MAQUINA = ? WHERE CODIGO = ?', [maquina, reference]);
}

async function pushPrograma(tx: SyntechTx, reference: string, programa: string) {
  await queryTx(tx, 'UPDATE PRODUTOS SET PROGRAMA = ? WHERE CODIGO = ?', [programa, reference]);
}

function guiaRowFilled(row: GuiaFioRow) {
  return Boolean(row.esquerda || row.direita || row.cabo || row.cabod || row.cor_do_fio);
}

async function upsertGuiaFioRow(tx: SyntechTx, reference: string, row: GuiaFioRow) {
  const existing = await queryTx(
    tx,
    'SELECT NUMERO FROM GUIA_FIO WHERE PRODUTO = ? AND NUMERO = ?',
    [reference, row.numero]
  );

  if (guiaRowFilled(row)) {
    if (existing.length > 0) {
      await queryTx(
        tx,
        `UPDATE GUIA_FIO
         SET ESQUERDA = ?, CABO = ?, DIREITA = ?, CABOD = ?, COR_DO_FIO = ?
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
    } else {
      await queryTx(
        tx,
        `INSERT INTO GUIA_FIO (PRODUTO, NUMERO, ESQUERDA, CABO, DIREITA, CABOD, COR_DO_FIO)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          reference,
          row.numero,
          row.esquerda,
          row.cabo,
          row.direita,
          row.cabod,
          row.cor_do_fio,
        ]
      );
    }
    return true;
  }

  if (existing.length > 0) {
    await queryTx(
      tx,
      `UPDATE GUIA_FIO
       SET ESQUERDA = NULL, CABO = NULL, DIREITA = NULL, CABOD = NULL, COR_DO_FIO = NULL
       WHERE PRODUTO = ? AND NUMERO = ?`,
      [reference, row.numero]
    );
  }

  return false;
}

async function pushGuiaFio(tx: SyntechTx, reference: string, rows: GuiaFioRow[]) {
  let filled = 0;
  for (const row of rows) {
    if (await upsertGuiaFioRow(tx, reference, row)) filled += 1;
  }
  return filled;
}

export async function pushCadastroToSyntech(input: SyntechPushInput): Promise<SyntechPushResult> {
  const reference = input.reference.trim();
  if (!reference) throw new Error('Informe a referência.');

  loadWeightFactorsFromDisk();

  const pushParts = input.parts;
  const mdvParts = pushParts.filter((p) => p.file_name && /\.mdv$/i.test(p.file_name));
  if (mdvParts.length === 0) throw new Error('Nenhuma parte .mdv para enviar.');

  const partWeightKg = pushParts.reduce((sum, part) => sum + parseWeightKg(part.weight_kg), 0);

  let consolidated: SyntechPushYarn[] = input.consolidated_yarns ?? [];
  const inputYarns = input.consolidated_yarns ?? [];
  if (input.model_folder) {
    const recalculated = recalculateConsolidatedYarns(
      input.model_folder,
      reference,
      pushParts.map((part) => ({
        label: part.label,
        file_name: part.file_name,
        weight_kg: part.weight_kg,
      }))
    );
    if (recalculated.length > 0) {
      consolidated = recalculated.map((row) => {
        const saved =
          inputYarns.find(
            (item) =>
              item.guide === row.guide &&
              (item.letter || '').toUpperCase() === (row.letter || '').toUpperCase()
          ) ?? inputYarns.find((item) => item.guide === row.guide);
        return {
          guide: row.guide,
          letter: row.letter,
          description: saved?.description?.trim() ? saved.description : row.description,
          consumption: row.consumption,
          pct: row.pct,
          tipo_fio_codigo: saved?.tipo_fio_codigo,
        };
      });
    }
  }

  const db = await attachSyntechDb();
  const warnings: string[] = [];
  if (consolidated.length === 0 && (input.consolidated_yarns ?? []).length === 0) {
    warnings.push('Nenhum consumo de fio calculado — confira .sin/.simx e pesos das partes');
  }

  try {
    const result = await runInTransaction(db, async (tx) => {
      const product = await productExists(tx, reference);
      if (!product) {
        throw new Error(`Produto ${reference} não existe no Syntech (PRODUTOS). Cadastre o produto antes.`);
      }

      let tempoRows = 0;
      for (let numero = 1; numero <= SLOT_COUNT; numero++) {
        const updated = await upsertTempoPesoRow(tx, reference, numero, pushParts[numero - 1]);
        if (updated) tempoRows += 1;
      }

      let maquina = input.maquina;
      let maquina_cms: string | undefined;
      let maquina_gauge: string | undefined;
      let programa: string | undefined;
      let guia_fio_rows = 0;
      let partes_prod_rows = 0;
      let bicos_maquina_rows = 0;
      let guiaRows: GuiaFioRow[] = [];

      if (input.model_folder) {
        const guiaFiles = [...new Set(mdvParts.map((part) => part.file_name))];
        guiaRows = buildGuiaFioRows(input.model_folder, guiaFiles);
      }

      const matPrimaRows = await pushMatPrima(
        tx,
        reference,
        consolidated,
        guiaRows,
        warnings,
        partWeightKg
      );

      const partesProd = buildPartesProdRows(mdvParts, {
        reference,
        folderName: input.model_folder ? path.basename(input.model_folder) : undefined,
      });
      partes_prod_rows = await pushPartesProd(tx, reference, partesProd);
      if (partes_prod_rows === 0) {
        warnings.push('Nenhuma parte para PARTES_PROD');
      }

      await pushPesoBrutoProduto(tx, reference, pushParts, partWeightKg);

      if (input.model_folder) {
        const sinFiles = [...new Set(mdvParts.map((part) => part.file_name))];
        const sinRows = readSinTextsForModel(input.model_folder, sinFiles);
        const firstSinText = sinRows[0]?.text;

        programa = resolvePrograma(input.model_folder, firstSinText) ?? undefined;
        if (programa) {
          await pushPrograma(tx, reference, programa);
        } else {
          warnings.push('Programa não identificado no .sin — PRODUTOS.PROGRAMA não alterado');
        }

        guia_fio_rows = await pushGuiaFio(tx, reference, guiaRows);
        if (guia_fio_rows === 0) {
          warnings.push('Nenhum guia-fio encontrado no .sin — GUIA_FIO não alterada');
        }
      }

      const bicoRows = await resolveBicosMaquina(
        tx,
        consolidated,
        guiaRows,
        warnings,
        partWeightKg
      );
      bicos_maquina_rows = await pushBicosMaquina(tx, reference, bicoRows);
      if (consolidated.length > 0 && bicos_maquina_rows === 0) {
        warnings.push('Nenhum bico gravado em matéria-prima para máquina');
      }

      if (maquina === undefined && input.model_folder) {
        const resolved = resolveMaquinaForModel(
          input.model_folder,
          [...new Set(mdvParts.map((part) => part.file_name))]
        );
        if (resolved) {
          maquina = resolved.syntech_maquina;
          maquina_cms = resolved.cms;
          maquina_gauge = resolved.gauge;
        } else {
          warnings.push('Máquina não identificada no .sin — PRODUTOS.MAQUINA não alterada');
        }
      }

      if (maquina !== undefined) {
        await pushMaquina(tx, reference, maquina);
      }

      return {
        ok: true,
        reference,
        product_name: product.NOME,
        tempo_rows: tempoRows,
        mat_prima_rows: matPrimaRows,
        maquina,
        maquina_cms,
        maquina_gauge,
        programa,
        guia_fio_rows,
        partes_prod_rows,
        bicos_maquina_rows,
        warnings,
      };
    });

    return result;
  } finally {
    await detachDb(db);
  }
}

export async function testSyntechConnection() {
  const db = await attachSyntechDb();
  try {
    const rows = await queryDb<{ N: number }>(db, 'SELECT 1 AS N FROM RDB$DATABASE');
    return rows.length > 0;
  } finally {
    await detachDb(db);
  }
}
