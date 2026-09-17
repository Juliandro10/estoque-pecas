import { repairSyntechText } from '../shared/syntech-name-match';
import {
  emptySyntechProdutoCadastro,
  SYNTECH_BICO_UI,
  SYNTECH_GUIA_SLOTS,
  SYNTECH_TEMPO_SLOTS,
  type SyntechProdutoCadastro,
  type SyntechProdutoCadastroOpcoes,
  type SyntechProdutoBico,
  type SyntechProdutoCor,
  type SyntechProdutoGuia,
  type SyntechProdutoParte,
  type SyntechProdutoTempo,
} from '../shared/syntech-produto-cadastro';
import {
  attachSyntechDb,
  clipSyntechText,
  detachDb,
  formatSyntechTempo,
  queryDb,
  queryTx,
  runInTransaction,
  tempoToTempom,
  type FirebirdDb,
  type SyntechTx,
} from './syntech-db';
import { createSyntechProduto, listSyntechProdutoOpcoes } from './syntech-desenv';
import { patchFirestoreJson } from '../painel-tecelagem/publish-firebase.ts';

const BICO_DB = 16;

function fbStr(value: unknown) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return repairSyntechText(value.toString('latin1')).trim();
  return repairSyntechText(String(value)).trim();
}

function asInt(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function asNum(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function asNum0(value: unknown) {
  return asNum(value) ?? 0;
}

let produtoCols: Set<string> | null = null;
let coresSpec: { table: string; prodCol: string; corCol: string; princCol: string | null } | null | undefined;

async function produtoColumnSet(db: FirebirdDb) {
  if (produtoCols) return produtoCols;
  const rows = await queryDb<{ FIELD: string }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD
     FROM RDB$RELATION_FIELDS rf
     WHERE rf.RDB$RELATION_NAME = 'PRODUTOS'`
  );
  produtoCols = new Set(rows.map((row) => fbStr(row.FIELD).toUpperCase()).filter(Boolean));
  return produtoCols;
}

function pickCol(cols: Set<string>, names: string[]) {
  return names.find((name) => cols.has(name)) ?? null;
}

async function resolveCoresSpec(db: FirebirdDb) {
  if (coresSpec !== undefined) return coresSpec;
  const tables = await queryDb<{ N: string }>(
    db,
    `SELECT TRIM(RDB$RELATION_NAME) AS N
     FROM RDB$RELATIONS
     WHERE RDB$SYSTEM_FLAG = 0
       AND (RDB$RELATION_NAME = 'CORES_PRODUTO'
         OR RDB$RELATION_NAME = 'PROD_CORES'
         OR RDB$RELATION_NAME = 'COR_PRODUTO'
         OR RDB$RELATION_NAME = 'CORES_PECA')`
  );
  const table = fbStr(tables[0]?.N);
  if (!table) {
    coresSpec = null;
    return null;
  }
  const cols = await queryDb<{ FIELD: string }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD
     FROM RDB$RELATION_FIELDS rf
     WHERE rf.RDB$RELATION_NAME = ?`,
    [table]
  );
  const set = new Set(cols.map((row) => fbStr(row.FIELD).toUpperCase()));
  const prodCol = pickCol(set, ['COD_PROD', 'PRODUTO', 'COD_PRODUTO', 'CODIGO']);
  const corCol = pickCol(set, ['COR', 'COD_COR', 'NUMERO']);
  const princCol = pickCol(set, ['PRINCIPAL', 'PRINC', 'COR_PRINCIPAL']);
  if (!prodCol || !corCol) {
    coresSpec = null;
    return null;
  }
  coresSpec = { table, prodCol, corCol, princCol };
  return coresSpec;
}

function mergeBicos(rows: SyntechProdutoBico[]): SyntechProdutoBico[] {
  const byBico = new Map(rows.map((row) => [row.bico, row]));
  return Array.from({ length: SYNTECH_BICO_UI }, (_, i) => {
    const bico = i + 1;
    return (
      byBico.get(bico) ?? {
        bico,
        parte: '',
        tipo_fio: null,
        perc: null,
        cabo: null,
        peso: null,
      }
    );
  });
}

function mergeGuias(rows: SyntechProdutoGuia[]): SyntechProdutoGuia[] {
  const byN = new Map(rows.map((row) => [row.numero, row]));
  return Array.from({ length: SYNTECH_GUIA_SLOTS }, (_, i) => {
    const numero = i + 1;
    return (
      byN.get(numero) ?? {
        numero,
        esquerda: '',
        cabo: '',
        direita: '',
        cabod: '',
        cor_do_fio: '',
      }
    );
  });
}

function mergeTempos(rows: SyntechProdutoTempo[]): SyntechProdutoTempo[] {
  const byN = new Map(rows.map((row) => [row.numero, row]));
  return Array.from({ length: SYNTECH_TEMPO_SLOTS }, (_, i) => {
    const numero = i + 1;
    return (
      byN.get(numero) ?? {
        numero,
        descricao: '',
        tempo: '',
        peso: null,
      }
    );
  });
}

async function readCores(db: FirebirdDb, codigo: string): Promise<SyntechProdutoCor[]> {
  const spec = await resolveCoresSpec(db);
  if (!spec) return [];
  try {
    const rows = await queryDb<{ COR: number | null; NOME: string | null; PRINCIPAL: unknown }>(
      db,
      `SELECT CP.${spec.corCol} AS COR,
              CAST(C.NOME AS VARCHAR(40)) AS NOME,
              ${spec.princCol ? `CP.${spec.princCol}` : 'NULL'} AS PRINCIPAL
       FROM ${spec.table} CP
       LEFT JOIN CORES C ON C.NUMERO = CP.${spec.corCol}
       WHERE TRIM(CAST(CP.${spec.prodCol} AS VARCHAR(13))) = ?`,
      [codigo]
    );
    return rows
      .map((row) => ({
        cor: asInt(row.COR) ?? 0,
        nome: fbStr(row.NOME),
        principal: String(row.PRINCIPAL ?? '').trim().toUpperCase() === 'S' || row.PRINCIPAL === true || Number(row.PRINCIPAL) === 1,
      }))
      .filter((row) => row.cor > 0);
  } catch {
    coresSpec = null;
    return [];
  }
}

async function writeCores(tx: SyntechTx, codigo: string, cores: SyntechProdutoCor[]) {
  const spec = coresSpec;
  if (!spec) return;
  await queryTx(tx, `DELETE FROM ${spec.table} WHERE TRIM(CAST(${spec.prodCol} AS VARCHAR(13))) = ?`, [codigo]);
  for (const row of cores) {
    if (!row.cor) continue;
    const princ = row.principal ? 'S' : 'N';
    if (spec.princCol) {
      await queryTx(
        tx,
        `INSERT INTO ${spec.table} (${spec.prodCol}, ${spec.corCol}, ${spec.princCol}) VALUES (?, ?, ?)`,
        [codigo, row.cor, princ]
      );
    } else {
      await queryTx(tx, `INSERT INTO ${spec.table} (${spec.prodCol}, ${spec.corCol}) VALUES (?, ?)`, [codigo, row.cor]);
    }
  }
}

function bicoSelectSql() {
  const parts: string[] = [];
  for (let n = 1; n <= SYNTECH_BICO_UI; n += 1) {
    parts.push(
      `CAST(PARTE${n} AS VARCHAR(20)) AS PARTE${n}`,
      `TIPO_FIO${n}`,
      `PERC${n}`,
      `CABO${n}`,
      `PESO${n}`
    );
  }
  return parts.join(',\n          ');
}

export async function listSyntechProdutoCadastroOpcoes(): Promise<SyntechProdutoCadastroOpcoes> {
  const base = await listSyntechProdutoOpcoes();
  const db = await attachSyntechDb();
  try {
    let tipoRows: Array<{ CODIGO: number | null; NOME: string | null }> = [];
    try {
      tipoRows = await queryDb(db, `SELECT CODIGO, CAST(NOME AS VARCHAR(60)) AS NOME FROM TIPO_FIO ORDER BY CODIGO`);
    } catch {
      tipoRows = [];
    }
    let maqRows: Array<{ NUMERO: number | null; NOME: string | null }> = [];
    try {
      maqRows = await queryDb(
        db,
        `SELECT NUMERO, CAST(DESCRICAO AS VARCHAR(40)) AS NOME
         FROM MAQUINAS
         WHERE NUMERO BETWEEN 1 AND 15 OR NUMERO IN (50, 51, 52)
         ORDER BY NUMERO`
      );
    } catch {
      maqRows = [];
    }
    return {
      ...base,
      tipos_fio: tipoRows
        .map((row) => ({ codigo: asInt(row.CODIGO) ?? 0, nome: fbStr(row.NOME) }))
        .filter((row) => row.codigo > 0),
      maquinas: maqRows
        .map((row) => ({ numero: asInt(row.NUMERO) ?? 0, nome: fbStr(row.NOME) }))
        .filter((row) => row.numero > 0),
    };
  } finally {
    await detachDb(db);
  }
}

export async function getSyntechProdutoCadastro(codigoRaw: string): Promise<SyntechProdutoCadastro> {
  const codigo = clipSyntechText(String(codigoRaw ?? '').trim(), 13);
  if (!codigo) throw new Error('Informe o código do produto.');

  const db = await attachSyntechDb();
  try {
    const cols = await produtoColumnSet(db);
    const obsCol = pickCol(cols, ['OBSERVACOES', 'OBSERVACAO', 'OBS']);
    const diasCol = pickCol(cols, ['DIAS_ENTREGA', 'PRAZO_ENTREGA', 'DIAS', 'PRAZO']);
    const md5Col = pickCol(cols, ['MD5_FOTO']);
    const extra = [
      obsCol ? `CAST(${obsCol} AS VARCHAR(400)) AS OBS_TXT` : `CAST('' AS VARCHAR(1)) AS OBS_TXT`,
      diasCol ? `${diasCol} AS DIAS_TXT` : `CAST(0 AS INTEGER) AS DIAS_TXT`,
      md5Col ? `CAST(${md5Col} AS VARCHAR(50)) AS MD5_FOTO` : `CAST('' AS VARCHAR(1)) AS MD5_FOTO`,
    ].join(',\n          ');

    const rows = await queryDb<Record<string, unknown>>(
      db,
      `SELECT FIRST 1
          CAST(CODIGO AS VARCHAR(13)) AS CODIGO,
          CAST(NOME AS VARCHAR(80)) AS NOME,
          CAST(UNIDADE AS VARCHAR(6)) AS UNIDADE,
          PESO, PESO_INI,
          CLASSIFICACAO, GRUPO, COD_FORN, COD_FUNC,
          CAST(NCM AS VARCHAR(10)) AS NCM,
          ESTOQUE_MINIMO,
          CAST(PROGRAMA AS VARCHAR(40)) AS PROGRAMA,
          MAQUINA,
          ${extra},
          ${bicoSelectSql()}
       FROM PRODUTOS
       WHERE TRIM(CAST(CODIGO AS VARCHAR(13))) = ?`,
      [codigo]
    );
    const row = rows[0];
    if (!row) throw new Error(`Não achei o código ${codigo} no Syntech.`);

    const bicos: SyntechProdutoBico[] = [];
    for (let n = 1; n <= SYNTECH_BICO_UI; n += 1) {
      bicos.push({
        bico: n,
        parte: fbStr(row[`PARTE${n}`]),
        tipo_fio: asInt(row[`TIPO_FIO${n}`]),
        perc: asNum(row[`PERC${n}`]),
        cabo: asInt(row[`CABO${n}`]),
        peso: asNum(row[`PESO${n}`]),
      });
    }

    const parteRows = await queryDb<{ PARTE: string | null; QUANT: number | null }>(
      db,
      `SELECT CAST(PARTE AS VARCHAR(20)) AS PARTE, QUANT
       FROM PARTES_PROD
       WHERE TRIM(CAST(COD_PROD AS VARCHAR(13))) = ?
       ORDER BY AUTOINC`,
      [codigo]
    );
    const partes: SyntechProdutoParte[] = parteRows
      .map((item) => ({ parte: fbStr(item.PARTE), quant: asNum0(item.QUANT) }))
      .filter((item) => item.parte);

    const guiaRows = await queryDb<{
      NUMERO: number | null;
      ESQUERDA: string | null;
      CABO: string | null;
      DIREITA: string | null;
      CABOD: string | null;
      COR_DO_FIO: string | null;
    }>(
      db,
      `SELECT NUMERO,
              CAST(ESQUERDA AS VARCHAR(40)) AS ESQUERDA,
              CAST(CABO AS VARCHAR(10)) AS CABO,
              CAST(DIREITA AS VARCHAR(40)) AS DIREITA,
              CAST(CABOD AS VARCHAR(10)) AS CABOD,
              CAST(COR_DO_FIO AS VARCHAR(40)) AS COR_DO_FIO
       FROM GUIA_FIO
       WHERE TRIM(CAST(PRODUTO AS VARCHAR(13))) = ?
       ORDER BY NUMERO`,
      [codigo]
    );
    const guias: SyntechProdutoGuia[] = guiaRows.map((item) => ({
      numero: asInt(item.NUMERO) ?? 0,
      esquerda: fbStr(item.ESQUERDA),
      cabo: fbStr(item.CABO),
      direita: fbStr(item.DIREITA),
      cabod: fbStr(item.CABOD),
      cor_do_fio: fbStr(item.COR_DO_FIO),
    }));

    const tempoRows = await queryDb<{
      NUMERO: number | null;
      DESCRICAO: string | null;
      TEMPO: string | null;
      PESO: number | null;
    }>(
      db,
      `SELECT NUMERO,
              CAST(DESCRICAO AS VARCHAR(20)) AS DESCRICAO,
              CAST(TEMPO AS VARCHAR(10)) AS TEMPO,
              PESO
       FROM TEMPO_PESO_PROD
       WHERE TRIM(CAST(PRODUTO AS VARCHAR(13))) = ?
       ORDER BY NUMERO`,
      [codigo]
    );
    const tempos: SyntechProdutoTempo[] = tempoRows.map((item) => ({
      numero: asInt(item.NUMERO) ?? 0,
      descricao: fbStr(item.DESCRICAO),
      tempo: fbStr(item.TEMPO).replace(/\s+/g, ''),
      peso: asNum(item.PESO),
    }));

    const base = emptySyntechProdutoCadastro(fbStr(row.CODIGO) || codigo);
    return {
      ...base,
      nome: fbStr(row.NOME),
      unidade: fbStr(row.UNIDADE) || 'PC',
      peso_bruto: asNum0(row.PESO),
      peso_liquido: asNum0(row.PESO_INI),
      classificacao: asInt(row.CLASSIFICACAO),
      grupo: asInt(row.GRUPO),
      fornecedor: asInt(row.COD_FORN),
      funcionario: asInt(row.COD_FUNC),
      ncm: fbStr(row.NCM),
      estoque_minimo: asNum0(row.ESTOQUE_MINIMO),
      dias_entrega: asNum0(row.DIAS_TXT),
      observacoes: fbStr(row.OBS_TXT),
      programa: fbStr(row.PROGRAMA),
      maquina: asInt(row.MAQUINA),
      md5_foto: fbStr(row.MD5_FOTO),
      tem_foto: Boolean(fbStr(row.MD5_FOTO)),
      bicos: mergeBicos(bicos),
      partes,
      cores: await readCores(db, codigo),
      guias: mergeGuias(guias.filter((row) => row.numero > 0)),
      tempos: mergeTempos(tempos.filter((row) => row.numero > 0)),
    };
  } finally {
    await detachDb(db);
  }
}

function guiaFilled(row: SyntechProdutoGuia) {
  return Boolean(row.esquerda || row.cabo || row.direita || row.cabod || row.cor_do_fio);
}

function tempoFilled(row: SyntechProdutoTempo) {
  return Boolean(row.descricao.trim() || row.tempo.trim() || (row.peso != null && row.peso > 0));
}

async function upsertGuia(tx: SyntechTx, codigo: string, row: SyntechProdutoGuia) {
  const existing = await queryTx(tx, 'SELECT NUMERO FROM GUIA_FIO WHERE PRODUTO = ? AND NUMERO = ?', [
    codigo,
    row.numero,
  ]);
  const esquerda = clipSyntechText(row.esquerda, 40) || null;
  const cabo = clipSyntechText(row.cabo, 10) || null;
  const direita = clipSyntechText(row.direita, 40) || null;
  const cabod = clipSyntechText(row.cabod, 10) || null;
  const cor = clipSyntechText(row.cor_do_fio, 40) || null;
  if (!guiaFilled(row)) {
    if (existing.length) {
      await queryTx(
        tx,
        `UPDATE GUIA_FIO
         SET ESQUERDA = NULL, CABO = NULL, DIREITA = NULL, CABOD = NULL, COR_DO_FIO = NULL
         WHERE PRODUTO = ? AND NUMERO = ?`,
        [codigo, row.numero]
      );
    }
    return;
  }
  if (existing.length) {
    await queryTx(
      tx,
      `UPDATE GUIA_FIO
       SET ESQUERDA = ?, CABO = ?, DIREITA = ?, CABOD = ?, COR_DO_FIO = ?
       WHERE PRODUTO = ? AND NUMERO = ?`,
      [esquerda, cabo, direita, cabod, cor, codigo, row.numero]
    );
    return;
  }
  await queryTx(
    tx,
    `INSERT INTO GUIA_FIO (PRODUTO, NUMERO, ESQUERDA, CABO, DIREITA, CABOD, COR_DO_FIO)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [codigo, row.numero, esquerda, cabo, direita, cabod, cor]
  );
}

async function upsertTempo(tx: SyntechTx, codigo: string, row: SyntechProdutoTempo) {
  const existing = await queryTx(tx, 'SELECT NUMERO FROM TEMPO_PESO_PROD WHERE PRODUTO = ? AND NUMERO = ?', [
    codigo,
    row.numero,
  ]);
  if (!tempoFilled(row)) {
    if (existing.length) {
      await queryTx(
        tx,
        `UPDATE TEMPO_PESO_PROD
         SET DESCRICAO = ?, TEMPO = NULL, PESO = NULL, TEMPOM = 0
         WHERE PRODUTO = ? AND NUMERO = ?`,
        [' ', codigo, row.numero]
      );
    }
    return;
  }
  const descricao = clipSyntechText(row.descricao || ' ', 10);
  const tempo = formatSyntechTempo(row.tempo || '00:00');
  const peso = row.peso ?? 0;
  const tempom = tempoToTempom(tempo);
  if (existing.length) {
    await queryTx(
      tx,
      `UPDATE TEMPO_PESO_PROD SET DESCRICAO = ?, TEMPO = ?, PESO = ?, TEMPOM = ?
       WHERE PRODUTO = ? AND NUMERO = ?`,
      [descricao, tempo, peso, tempom, codigo, row.numero]
    );
    return;
  }
  await queryTx(
    tx,
    `INSERT INTO TEMPO_PESO_PROD (PRODUTO, NUMERO, DESCRICAO, TEMPO, PESO, TEMPOM)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [codigo, row.numero, descricao, tempo, peso, tempom]
  );
}

async function writePartes(tx: SyntechTx, codigo: string, partes: SyntechProdutoParte[]) {
  await queryTx(tx, 'DELETE FROM PARTES_PROD WHERE COD_PROD = ?', [codigo]);
  let autoinc = 1;
  for (const row of partes) {
    const parte = clipSyntechText(row.parte, 15);
    if (!parte) continue;
    await queryTx(tx, 'INSERT INTO PARTES_PROD (COD_PROD, AUTOINC, PARTE, QUANT) VALUES (?, ?, ?, ?)', [
      codigo,
      autoinc,
      parte,
      row.quant || 1,
    ]);
    autoinc += 1;
  }
}

async function writeBicos(tx: SyntechTx, codigo: string, bicos: SyntechProdutoBico[]) {
  const byBico = new Map(bicos.map((row) => [row.bico, row]));
  const sets: string[] = [];
  const params: unknown[] = [];
  for (let n = 1; n <= BICO_DB; n += 1) {
    const row = byBico.get(n);
    sets.push(`PARTE${n} = ?`, `TIPO_FIO${n} = ?`, `PERC${n} = ?`, `CABO${n} = ?`, `PESO${n} = ?`);
    params.push(
      row?.parte ? clipSyntechText(row.parte, 15) : null,
      row?.tipo_fio || null,
      row?.perc ?? null,
      row?.cabo ?? null,
      row?.peso ?? null
    );
  }
  await queryTx(tx, `UPDATE PRODUTOS SET ${sets.join(', ')} WHERE CODIGO = ?`, [...params, codigo]);
}

async function writeCabecalho(
  tx: SyntechTx,
  codigo: string,
  input: SyntechProdutoCadastro,
  cols: Set<string>
) {
  const sets = [
    'NOME = ?',
    'UNIDADE = ?',
    'PESO = ?',
    'PESO_INI = ?',
    'CLASSIFICACAO = ?',
    'GRUPO = ?',
    'COD_FORN = ?',
    'COD_FUNC = ?',
    'NCM = ?',
    'ESTOQUE_MINIMO = ?',
    'PROGRAMA = ?',
    'MAQUINA = ?',
  ];
  const params: unknown[] = [
    clipSyntechText(input.nome, 50),
    clipSyntechText(input.unidade || 'PC', 3) || 'PC',
    input.peso_bruto || 0,
    input.peso_liquido || 0,
    input.classificacao,
    input.grupo,
    input.fornecedor,
    input.funcionario,
    clipSyntechText(input.ncm, 10),
    input.estoque_minimo || 0,
    clipSyntechText(input.programa, 40) || null,
    input.maquina,
  ];
  const obsCol = pickCol(cols, ['OBSERVACOES', 'OBSERVACAO', 'OBS']);
  const diasCol = pickCol(cols, ['DIAS_ENTREGA', 'PRAZO_ENTREGA', 'DIAS', 'PRAZO']);
  if (obsCol) {
    sets.push(`${obsCol} = ?`);
    params.push(clipSyntechText(input.observacoes, 200) || null);
  }
  if (diasCol) {
    sets.push(`${diasCol} = ?`);
    params.push(input.dias_entrega || 0);
  }
  await queryTx(tx, `UPDATE PRODUTOS SET ${sets.join(', ')} WHERE CODIGO = ?`, [...params, codigo]);
}

export async function saveSyntechProdutoCadastro(input: SyntechProdutoCadastro) {
  const merged = { ...emptySyntechProdutoCadastro(input.codigo), ...input };
  const codigo = clipSyntechText(String(merged.codigo ?? '').trim(), 13);
  if (!codigo) throw new Error('Informe o código do produto.');
  if (!String(merged.nome ?? '').trim()) throw new Error('Informe a descrição.');

  const db = await attachSyntechDb();
  try {
    const cols = await produtoColumnSet(db);
    await resolveCoresSpec(db);
    await runInTransaction(db, async (tx) => {
      const exists = await queryTx(tx, 'SELECT FIRST 1 CODIGO FROM PRODUTOS WHERE TRIM(CAST(CODIGO AS VARCHAR(13))) = ?', [
        codigo,
      ]);
      if (!exists[0]) throw new Error(`Não achei o código ${codigo} no Syntech. Cadastre o produto primeiro.`);
      await writeCabecalho(tx, codigo, { ...merged, codigo }, cols);
      await writeBicos(tx, codigo, mergeBicos(merged.bicos ?? []));
      await writePartes(tx, codigo, merged.partes ?? []);
      await writeCores(tx, codigo, merged.cores ?? []);
      for (const guia of mergeGuias(merged.guias ?? [])) await upsertGuia(tx, codigo, guia);
      for (const tempo of mergeTempos(merged.tempos ?? [])) await upsertTempo(tx, codigo, tempo);
    });
    return { ok: true as const, codigo };
  } finally {
    await detachDb(db);
  }
}

export async function createSyntechProdutoCadastro(input: SyntechProdutoCadastro) {
  const payload = { ...emptySyntechProdutoCadastro(input.codigo), ...input };
  const created = await createSyntechProduto({
    codigo: payload.codigo,
    nome: payload.nome,
    classificacao: Number(payload.classificacao),
    grupo: Number(payload.grupo),
    fornecedor: Number(payload.fornecedor),
    funcionario: Number(payload.funcionario),
    ncm: payload.ncm,
  });
  await saveSyntechProdutoCadastro({ ...payload, codigo: created.codigo, nome: created.nome });
  return created;
}

export async function publishSyntechProdutoNuvem(produto: SyntechProdutoCadastro) {
  const codigo = clipSyntechText(String(produto.codigo ?? '').trim(), 13);
  if (!codigo) return false;
  return patchFirestoreJson('syntech_produtos', codigo, produto);
}

export async function loadAndPublishSyntechProdutoNuvem(codigoRaw: string) {
  const produto = await getSyntechProdutoCadastro(codigoRaw);
  await publishSyntechProdutoNuvem(produto);
  return produto;
}
