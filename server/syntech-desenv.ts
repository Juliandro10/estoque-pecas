import { repairSyntechText } from '../shared/syntech-name-match';
import {
  attachSyntechDb,
  clipSyntechText,
  detachDb,
  queryDb,
  queryTx,
  runInTransaction,
} from './syntech-db';

export type SyntechDesenvPendente = {
  codigo: string;
  nome: string;
  grupo: string;
  cadastro: string | null;
};

function fbStr(value: unknown) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return repairSyntechText(value.toString('latin1')).trim();
  return repairSyntechText(String(value)).trim();
}

function ymd(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  return null;
}

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Produto no Syntech ainda sem programa — cadastro feito, desenvolvimento não. */
export async function listSyntechDesenvPendentes(busca = ''): Promise<SyntechDesenvPendente[]> {
  const q = busca.trim().slice(0, 40);
  const db = await attachSyntechDb();
  try {
    const params: unknown[] = [];
    let sql = `SELECT FIRST 200
        CAST(P.CODIGO AS VARCHAR(13)) AS CODIGO,
        CAST(P.NOME AS VARCHAR(80)) AS NOME,
        P.DAT_CAD,
        CAST(G.DESCRICAO AS VARCHAR(40)) AS GRUPO_NOME
      FROM PRODUTOS P
      LEFT JOIN GRUPO_PROD G ON G.CODIGO = P.GRUPO
      WHERE P.INATIVO = 'N'
        AND (P.PROGRAMA IS NULL OR TRIM(CAST(P.PROGRAMA AS VARCHAR(40))) = '')
        AND (P.COD_SIT IS NULL OR P.COD_SIT <> 101)`;
    if (q) {
      sql += ` AND (CAST(P.CODIGO AS VARCHAR(13)) CONTAINING ? OR UPPER(CAST(P.NOME AS VARCHAR(80))) CONTAINING ?)`;
      params.push(q, q.toUpperCase());
    } else {
      sql += ` AND P.DAT_CAD >= ?`;
      params.push(monthsAgo(18));
    }
    sql += ` ORDER BY P.DAT_CAD DESC`;

    const rows = await queryDb<{
      CODIGO: string | null;
      NOME: string | null;
      DAT_CAD: Date | string | null;
      GRUPO_NOME: string | null;
    }>(db, sql, params);

    return rows
      .map((row) => ({
        codigo: fbStr(row.CODIGO),
        nome: fbStr(row.NOME),
        grupo: fbStr(row.GRUPO_NOME),
        cadastro: ymd(row.DAT_CAD),
      }))
      .filter((row) => row.codigo);
  } finally {
    await detachDb(db);
  }
}

/** A referência já existe no Syntech? Usado no lançamento (novo vs ajuste). */
export async function lookupSyntechProduto(codigo: string) {
  const ref = codigo.trim().slice(0, 13);
  if (!ref) return { existe: false as const, codigo: '', nome: '', cliente: '', tem_programa: false };

  const db = await attachSyntechDb();
  try {
    const rows = await queryDb<{
      CODIGO: string | null;
      NOME: string | null;
      PROGRAMA: string | null;
    }>(
      db,
      `SELECT FIRST 1
          CAST(CODIGO AS VARCHAR(13)) AS CODIGO,
          CAST(NOME AS VARCHAR(80)) AS NOME,
          CAST(PROGRAMA AS VARCHAR(40)) AS PROGRAMA
        FROM PRODUTOS
        WHERE TRIM(CAST(CODIGO AS VARCHAR(13))) = ?`,
      [ref]
    );
    const row = rows[0];
    if (!row) return { existe: false as const, codigo: ref, nome: '', cliente: '', tem_programa: false };

    const clientRows = await queryDb<{ NOME: string | null }>(
      db,
      `SELECT FIRST 1 CAST(C.NOME AS VARCHAR(60)) AS NOME
       FROM ORDEM_SERVICO O
       LEFT JOIN CLIENTES C ON C.CODIGO = O.CLIENTE
       WHERE TRIM(CAST(O.COD_PROD AS VARCHAR(13))) = ?
       ORDER BY O.NUMERO DESC`,
      [ref]
    );

    return {
      existe: true as const,
      codigo: fbStr(row.CODIGO) || ref,
      nome: fbStr(row.NOME),
      cliente: fbStr(clientRows[0]?.NOME),
      tem_programa: Boolean(fbStr(row.PROGRAMA)),
    };
  } finally {
    await detachDb(db);
  }
}

export type SyntechProdutoCatalogItem = {
  nome: string;
  cliente: string;
  tem_programa: boolean;
};

/** Cadastro resumido para o celular consultar na nuvem, sem o Firebird da fábrica. */
export async function listSyntechProdutoCatalog() {
  const db = await attachSyntechDb();
  try {
    const rows = await queryDb<{
      CODIGO: string | null;
      NOME: string | null;
      PROGRAMA: string | null;
    }>(
      db,
      `SELECT CAST(CODIGO AS VARCHAR(13)) AS CODIGO,
              CAST(NOME AS VARCHAR(80)) AS NOME,
              CAST(PROGRAMA AS VARCHAR(40)) AS PROGRAMA
         FROM PRODUTOS
        WHERE INATIVO IS NULL OR INATIVO <> 'S'`
    );
    const catalog: Record<string, SyntechProdutoCatalogItem> = {};
    for (const row of rows) {
      const codigo = fbStr(row.CODIGO);
      if (!codigo) continue;
      catalog[codigo] = {
        nome: fbStr(row.NOME),
        cliente: '',
        tem_programa: Boolean(fbStr(row.PROGRAMA)),
      };
    }
    return catalog;
  } finally {
    await detachDb(db);
  }
}

export type SyntechLookupOption = {
  codigo: number;
  nome: string;
};

export type SyntechNcmOption = {
  codigo: string;
};

export type SyntechProdutoOpcoes = {
  classificacoes: SyntechLookupOption[];
  grupos: SyntechLookupOption[];
  fornecedores: SyntechLookupOption[];
  funcionarios: SyntechLookupOption[];
  ncms: SyntechNcmOption[];
  defaults: {
    classificacao: number | null;
    grupo: number | null;
    fornecedor: number | null;
    funcionario: number | null;
    ncm: string;
  };
};

export type SyntechNovoProduto = {
  codigo: string;
  nome: string;
  classificacao: number;
  grupo: number;
  fornecedor: number;
  funcionario: number;
  ncm: string;
};

function asInt(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function pickDefault(options: SyntechLookupOption[], preferred: number) {
  if (options.some((row) => row.codigo === preferred)) return preferred;
  return options[0]?.codigo ?? null;
}

function syntechInsertError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  const low = msg.toLowerCase();
  if (low.includes('ja_existe') || low.includes('ja existe')) {
    return 'Esse código já existe no Syntech.';
  }
  if (low.includes('def_peso')) return 'O Syntech exigiu peso. Tente de novo.';
  if (low.includes('def_composicao')) return 'O Syntech exigiu composição.';
  if (low.includes('def_forn')) return 'Fornecedor não encontrado no Syntech.';
  if (low.includes('def_cod_sit')) return 'Situação tributária padrão não encontrada no Syntech.';
  if (low.includes('def_nome')) return 'Informe a descrição.';
  if (low.includes('def_unidade')) return 'Unidade PC não aceita no Syntech.';
  return msg;
}

/** Listas do Cadastro de Produtos: classificação, grupo, fornecedor, funcionário e NCM. */
export async function listSyntechProdutoOpcoes(): Promise<SyntechProdutoOpcoes> {
  const db = await attachSyntechDb();
  try {
    const classRows = await queryDb<{ CODIGO: number | null; NOME: string | null }>(
      db,
      `SELECT CODIGO, CAST(DESCRICAO AS VARCHAR(60)) AS NOME
       FROM CLASS_PROD
       ORDER BY DESCRICAO`
    );
    const grupoRows = await queryDb<{ CODIGO: number | null; NOME: string | null }>(
      db,
      `SELECT CODIGO, CAST(DESCRICAO AS VARCHAR(60)) AS NOME
       FROM GRUPO_PROD
       ORDER BY DESCRICAO`
    );
    const fornRows = await queryDb<{ CODIGO: number | null; NOME: string | null }>(
      db,
      `SELECT CODIGO, CAST(NOME AS VARCHAR(80)) AS NOME
       FROM FORNECEDORES
       WHERE BLOQUEADO IS NULL OR BLOQUEADO <> 'S'
       ORDER BY NOME`
    );
    const funcRows = await queryDb<{ CODIGO: number | null; NOME: string | null }>(
      db,
      `SELECT CODIGO, CAST(NOME AS VARCHAR(60)) AS NOME
       FROM VENDEDORES
       WHERE INATIVO IS NULL OR INATIVO <> 'S'
       ORDER BY NOME`
    );
    const ncmRows = await queryDb<{ NCM: string | null }>(
      db,
      `SELECT FIRST 200 CAST(NCM AS VARCHAR(10)) AS NCM
       FROM PRODUTOS
       WHERE NCM IS NOT NULL AND TRIM(CAST(NCM AS VARCHAR(10))) <> ''
       GROUP BY 1
       ORDER BY COUNT(*) DESC, 1`
    );

    const toOpts = (rows: { CODIGO: number | null; NOME: string | null }[]) =>
      rows
        .map((row) => ({ codigo: asInt(row.CODIGO), nome: fbStr(row.NOME) }))
        .filter((row) => row.codigo > 0 && row.nome);

    const classificacoes = toOpts(classRows);
    const grupos = toOpts(grupoRows);
    const fornecedores = toOpts(fornRows);
    const funcionarios = toOpts(funcRows);
    const ncms = ncmRows
      .map((row) => ({ codigo: fbStr(row.NCM) }))
      .filter((row) => row.codigo);

    const ncmDefault = ncms.some((row) => row.codigo === '6106.20.00')
      ? '6106.20.00'
      : ncms[0]?.codigo ?? '';

    return {
      classificacoes,
      grupos,
      fornecedores,
      funcionarios,
      ncms,
      defaults: {
        classificacao: pickDefault(classificacoes, 44),
        grupo: pickDefault(grupos, 1),
        fornecedor: pickDefault(fornecedores, 1),
        funcionario: pickDefault(funcionarios, 26),
        ncm: ncmDefault,
      },
    };
  } finally {
    await detachDb(db);
  }
}

/** Grava o produto novo no Syntech. O restante do cadastro entra depois nos processos. */
export async function createSyntechProduto(input: SyntechNovoProduto) {
  const codigo = clipSyntechText(String(input.codigo ?? '').trim(), 13);
  const nome = clipSyntechText(String(input.nome ?? '').trim(), 50);
  const classificacao = asInt(input.classificacao);
  const grupo = asInt(input.grupo);
  const fornecedor = asInt(input.fornecedor);
  const funcionario = asInt(input.funcionario);
  const ncm = clipSyntechText(String(input.ncm ?? '').trim(), 10);

  if (!codigo) throw new Error('Informe o código do produto.');
  if (!nome) throw new Error('Informe a descrição.');
  if (!classificacao) throw new Error('Escolha a classificação.');
  if (!grupo) throw new Error('Escolha o grupo.');
  if (!fornecedor) throw new Error('Escolha o fornecedor.');
  if (!funcionario) throw new Error('Escolha o funcionário.');
  if (!ncm) throw new Error('Escolha o NCM.');

  const db = await attachSyntechDb();
  try {
    return await runInTransaction(db, async (tx) => {
      const jaTem = await queryTx<{ CODIGO: string | null; NOME: string | null }>(
        tx,
        `SELECT FIRST 1 CAST(CODIGO AS VARCHAR(13)) AS CODIGO, CAST(NOME AS VARCHAR(50)) AS NOME
         FROM PRODUTOS
         WHERE TRIM(CAST(CODIGO AS VARCHAR(13))) = ?`,
        [codigo]
      );
      if (jaTem[0]) {
        const existente = fbStr(jaTem[0].NOME);
        throw new Error(
          existente
            ? `O código ${codigo} já existe no Syntech (${existente}).`
            : `O código ${codigo} já existe no Syntech.`
        );
      }

      const classOk = await queryTx<{ CODIGO: number | null }>(
        tx,
        'SELECT FIRST 1 CODIGO FROM CLASS_PROD WHERE CODIGO = ?',
        [classificacao]
      );
      if (!classOk[0]) throw new Error('Classificação não encontrada no Syntech.');

      const grupoOk = await queryTx<{ CODIGO: number | null }>(
        tx,
        'SELECT FIRST 1 CODIGO FROM GRUPO_PROD WHERE CODIGO = ?',
        [grupo]
      );
      if (!grupoOk[0]) throw new Error('Grupo não encontrado no Syntech.');

      const fornOk = await queryTx<{ CODIGO: number | null }>(
        tx,
        'SELECT FIRST 1 CODIGO FROM FORNECEDORES WHERE CODIGO = ?',
        [fornecedor]
      );
      if (!fornOk[0]) throw new Error('Fornecedor não encontrado no Syntech.');

      const funcOk = await queryTx<{ CODIGO: number | null }>(
        tx,
        'SELECT FIRST 1 CODIGO FROM VENDEDORES WHERE CODIGO = ?',
        [funcionario]
      );
      if (!funcOk[0]) throw new Error('Funcionário não encontrado no Syntech.');

      try {
        await queryTx(
          tx,
          `INSERT INTO PRODUTOS (
              CODIGO, NOME, UNIDADE, COMPOSICAO,
              CLASSIFICACAO, GRUPO, COD_FORN, COD_FUNC, NCM,
              ORIGEM, COD_SIT, INATIVO,
              PESO, PESO_INI,
              PRECO_VENDA, PRECO_CUSTO, PRECO_VENDA_LJ, CUSTO_PROD, LUCRO, LUCRO_LJ,
              ALIQUOTA_IPI, BASE_RED, BASE_CALC, ALIQUOTA_ICMS,
              ESTOQUE_INIC, ESTOQUE_ATUAL, ESTOQUE_MINIMO, LIMITE_DESC,
              QUANT_CX, PIS, COFINS, ALI_PIS, ALI_COFINS, TIPO_PRECO, COR_PRINCIPAL
            ) VALUES (
              ?, ?, 'PC', '-',
              ?, ?, ?, ?, ?,
              0, 0, 'N',
              0.001, 0.001,
              0, 0, 0, 0, 0, 0,
              0, 0, 0, 18,
              0, 0, 0, 0,
              0, '01', '01', 1.6, 7.65, '1', 1
            )`,
          [codigo, nome, classificacao, grupo, fornecedor, funcionario, ncm]
        );
      } catch (err) {
        throw new Error(syntechInsertError(err));
      }

      return { ok: true as const, codigo, nome };
    });
  } finally {
    await detachDb(db);
  }
}
