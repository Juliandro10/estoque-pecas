import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  const cols = await queryDb<{ FIELD: string; LEN: number }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD, f.RDB$FIELD_LENGTH AS LEN
     FROM RDB$RELATION_FIELDS rf
     JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
     WHERE rf.RDB$RELATION_NAME = 'PARTES_PROD'
     ORDER BY rf.RDB$FIELD_POSITION`
  );
  console.log('PARTES_PROD', cols);

  const prod = await queryDb<{ FIELD: string; LEN: number }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD, f.RDB$FIELD_LENGTH AS LEN
     FROM RDB$RELATION_FIELDS rf
     JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
     WHERE rf.RDB$RELATION_NAME = 'PRODUTOS'
       AND (rf.RDB$FIELD_NAME STARTING WITH 'PARTE'
         OR rf.RDB$FIELD_NAME STARTING WITH 'PERC'
         OR rf.RDB$FIELD_NAME STARTING WITH 'PESO'
         OR rf.RDB$FIELD_NAME = 'PROGRAMA')
     ORDER BY rf.RDB$FIELD_NAME`
  );
  console.log('PRODUTOS bicos', prod);

  const guia = await queryDb<{ FIELD: string; LEN: number }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD, f.RDB$FIELD_LENGTH AS LEN
     FROM RDB$RELATION_FIELDS rf
     JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
     WHERE rf.RDB$RELATION_NAME = 'GUIA_FIO'
     ORDER BY rf.RDB$FIELD_POSITION`
  );
  console.log('GUIA_FIO', guia);

  const sample = await queryDb<{ PARTE: string }>(
    db,
    'SELECT FIRST 5 CAST(PARTE AS VARCHAR(40)) AS PARTE FROM PARTES_PROD WHERE PARTE IS NOT NULL'
  );
  console.log('sample PARTE', sample);

  const mat = await queryDb<{ FIELD: string; LEN: number }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD, f.RDB$FIELD_LENGTH AS LEN
     FROM RDB$RELATION_FIELDS rf
     JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
     WHERE rf.RDB$RELATION_NAME = 'MAT_PRIMA_PROD'
     ORDER BY rf.RDB$FIELD_POSITION`
  );
  console.log('MAT_PRIMA_PROD', mat);

  const tempo = await queryDb<{ FIELD: string; LEN: number }>(
    db,
    `SELECT TRIM(rf.RDB$FIELD_NAME) AS FIELD, f.RDB$FIELD_LENGTH AS LEN
     FROM RDB$RELATION_FIELDS rf
     JOIN RDB$FIELDS f ON f.RDB$FIELD_NAME = rf.RDB$FIELD_SOURCE
     WHERE rf.RDB$RELATION_NAME = 'TEMPO_PESO_PROD'
     ORDER BY rf.RDB$FIELD_POSITION`
  );
  console.log('TEMPO_PESO_PROD', tempo);

  const p5433 = await queryDb(
    db,
    `SELECT FIRST 1 CAST(PARTE3 AS VARCHAR(20)) AS P3, CAST(PARTE4 AS VARCHAR(20)) AS P4,
            CAST(PARTE8 AS VARCHAR(20)) AS P8, CAST(PARTE9 AS VARCHAR(20)) AS P9,
            PERC3, PERC4, PESO3, PESO4, TIPO_FIO3, TIPO_FIO4, TIPO_FIO8, TIPO_FIO9
     FROM PRODUTOS WHERE CODIGO = '5433'`
  );
  console.log('PRODUTOS 5433 before', p5433);
} finally {
  await detachDb(db);
}
