import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  const modal = await queryDb<{ CODIGO: number; NOME: string }>(
    db,
    `SELECT CODIGO, CAST(NOME AS VARCHAR(80)) AS NOME FROM TIPO_FIO
     WHERE UPPER(CAST(NOME AS VARCHAR(80))) CONTAINING 'MODAL AREZZO'`
  );
  console.log('TIPO_FIO MODAL AREZZO:', modal);

  const coresNome = await queryDb<{ NUMERO: number; NOME: string }>(
    db,
    `SELECT NUMERO, CAST(NOME AS VARCHAR(80)) AS NOME FROM CORES
     WHERE UPPER(CAST(NOME AS VARCHAR(80))) CONTAINING 'SACH'
        OR UPPER(CAST(NOME AS VARCHAR(80))) CONTAINING 'PINK'`
  );
  console.log('\nCORES com SACH ou PINK (amostra):');
  for (const row of coresNome.filter((r) => /sach/i.test(r.NOME)).slice(0, 20)) {
    console.log(`  ${row.NUMERO} | ${row.NOME}`);
  }

  if (modal[0]) {
    const codigo = modal[0].CODIGO;
    const linked = await queryDb<{ COR: string }>(
      db,
      `SELECT DISTINCT CAST(C.NOME AS VARCHAR(80)) AS COR
       FROM (
         SELECT TIPO_FIO, COR FROM RESERVA_FIOS_PROD WHERE TIPO_FIO = ?
         UNION SELECT TIPO_FIO, COR FROM ITENS_PED_FIO WHERE TIPO_FIO = ?
         UNION SELECT TIPO_FIO, COR FROM ENTR_CONES WHERE TIPO_FIO = ?
         UNION SELECT TIPO_FIO, COR FROM QUANT_CONES WHERE TIPO_FIO = ?
       ) X
       JOIN CORES C ON C.NUMERO = X.COR
       WHERE UPPER(CAST(C.NOME AS VARCHAR(80))) CONTAINING 'SACH'`,
      [codigo, codigo, codigo, codigo]
    );
    console.log(`\nSACH* usado com MODAL AREZZO (cod ${codigo}) nas tabelas de movimento:`, linked);

    const tables = await queryDb(
      db,
      `SELECT TRIM(RDB$RELATION_NAME) AS T FROM RDB$RELATIONS
       WHERE RDB$SYSTEM_FLAG = 0 AND RDB$RELATION_NAME CONTAINING 'COR'`
    );
    console.log('\nTabelas COR*:', (tables as { T: string }[]).map((r) => r.T).slice(0, 30));
  }
} finally {
  await detachDb(db);
}
