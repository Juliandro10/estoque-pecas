import { repairSyntechText } from '../shared/syntech-name-match';
import { attachSyntechDb, detachDb, queryDb } from './syntech-db';

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
