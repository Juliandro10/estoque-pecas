import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  for (const table of ['FIOS_SST', 'GUIA_FIO', 'TIPO_FIO_COR_EST_MIN']) {
    try {
      const rows = await queryDb(
        db,
        table === 'GUIA_FIO'
          ? `SELECT FIRST 10 CAST(G.DIREITA AS VARCHAR(40)) AS TIPO, CAST(G.COR_DO_FIO AS VARCHAR(40)) AS COR
             FROM GUIA_FIO G
             WHERE UPPER(CAST(G.DIREITA AS VARCHAR(40))) CONTAINING 'MODAL'
               AND UPPER(CAST(G.COR_DO_FIO AS VARCHAR(40))) CONTAINING 'SACH'`
          : `SELECT FIRST 10 * FROM ${table} WHERE 1=0`
      );
      if (table !== 'GUIA_FIO') {
        const cols = await queryDb<{ FIELD: string }>(
          db,
          `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD FROM RDB$RELATION_FIELDS rf
           WHERE rf.RDB$RELATION_NAME = '${table}' ORDER BY rf.RDB$FIELD_POSITION`
        );
        console.log(`\n${table} cols:`, cols.map((c) => c.FIELD).join(', '));
        const hit = await queryDb(
          db,
          `SELECT CAST(T.NOME AS VARCHAR(40)) AS TIPO, CAST(C.NOME AS VARCHAR(40)) AS COR
           FROM ${table} X
           JOIN TIPO_FIO T ON T.CODIGO = X.TIPO_FIO
           JOIN CORES C ON C.NUMERO = X.COR
           WHERE X.TIPO_FIO = 47 AND UPPER(C.NOME) CONTAINING 'SACH'`
        );
        if (hit.length) console.log(`${table} MODAL+SACH:`, hit);
      } else if (rows.length) {
        console.log('\nGUIA_FIO MODAL+SACH:', rows);
      }
    } catch (e) {
      console.log(`${table}:`, (e as Error).message?.slice(0, 80));
    }
  }

  const allSach = await queryDb(
    db,
    `SELECT NUMERO, CAST(NOME AS VARCHAR(40)) AS NOME FROM CORES
     WHERE UPPER(CAST(NOME AS VARCHAR(40))) CONTAINING 'SACH'
     ORDER BY NOME`
  );
  console.log('\nTodas CORES com SACH*:');
  for (const r of allSach) console.log(`  ${(r as { NUMERO: number }).NUMERO} | ${(r as { NOME: string }).NOME?.trim()}`);
} finally {
  await detachDb(db);
}
