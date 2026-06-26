import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  const tables = await queryDb<{ T: string }>(
    db,
    `SELECT TRIM(R.RDB$RELATION_NAME) AS T
     FROM RDB$RELATIONS R
     WHERE R.RDB$SYSTEM_FLAG = 0
       AND EXISTS (
         SELECT 1 FROM RDB$RELATION_FIELDS F
         WHERE F.RDB$RELATION_NAME = R.RDB$RELATION_NAME
           AND F.RDB$FIELD_NAME CONTAINING 'COR'
       )
       AND EXISTS (
         SELECT 1 FROM RDB$RELATION_FIELDS F2
         WHERE F2.RDB$RELATION_NAME = R.RDB$RELATION_NAME
           AND (F2.RDB$FIELD_NAME CONTAINING 'TIPO_FIO' OR F2.RDB$FIELD_NAME = 'CODIGO')
       )
     ORDER BY 1`
  );
  console.log('Tabelas com COR + TIPO_FIO/CODIGO:');
  for (const row of tables) console.log(' ', row.T);

  for (const table of tables.map((r) => r.T)) {
    if (table.includes('OLD') || table.includes('ITENS')) continue;
    try {
      const hit = await queryDb(
        db,
        `SELECT FIRST 1 * FROM ${table} WHERE 1=0`
      );
      void hit;
    } catch {
      continue;
    }
    try {
      const rows = await queryDb(
        db,
        `SELECT COUNT(*) AS N FROM ${table}`
      );
      const n = (rows[0] as { N: number }).N;
      if (n === 0) continue;
      const test = await queryDb(
        db,
        `SELECT FIRST 1 * FROM ${table}`
      );
      const keys = Object.keys(test[0] ?? {});
      const hasCodigo = keys.some((k) => k === 'CODIGO' || k === 'TIPO_FIO');
      const hasCor = keys.some((k) => k.includes('COR'));
      if (!hasCodigo || !hasCor) continue;

      const q =
        keys.includes('TIPO_FIO') && keys.includes('COR')
          ? `SELECT CAST(C.NOME AS VARCHAR(40)) AS COR FROM ${table} X JOIN CORES C ON C.NUMERO = X.COR
             WHERE X.TIPO_FIO = 47 AND UPPER(C.NOME) CONTAINING 'SACH'`
          : keys.includes('CODIGO') && keys.includes('COR')
            ? `SELECT CAST(C.NOME AS VARCHAR(40)) AS COR FROM ${table} X JOIN CORES C ON C.NUMERO = X.COR
               WHERE X.CODIGO = 47 AND UPPER(C.NOME) CONTAINING 'SACH'`
            : null;
      if (!q) continue;
      const found = await queryDb(db, q);
      if (found.length) console.log(`\n${table}:`, found);
    } catch {
      // skip
    }
  }
} finally {
  await detachDb(db);
}
