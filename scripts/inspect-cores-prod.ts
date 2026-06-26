import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  for (const table of ['CORES_PROD', 'CORES_PRODUTO', 'TIPO_FIO']) {
    const cols = await queryDb<{ FIELD: string }>(
      db,
      `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD
       FROM RDB$RELATION_FIELDS rf
       WHERE rf.RDB$RELATION_NAME = ?
       ORDER BY rf.RDB$FIELD_POSITION`,
      [table]
    );
    console.log(`\n${table}:`, cols.map((c) => c.FIELD).join(', '));
  }

  const sample = await queryDb(db, 'SELECT FIRST 3 * FROM CORES_PROD');
  console.log('\nCORES_PROD sample:', sample);

  const modal = await queryDb(
    db,
    `SELECT FIRST 20 * FROM CORES_PROD WHERE TIPO_FIO = 47`
  );
  console.log('\nCORES_PROD tipo_fio=47 count sample:', modal.length, modal[0]);
} finally {
  await detachDb(db);
}
