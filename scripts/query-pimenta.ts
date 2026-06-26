import { attachSyntechDb, detachDb, queryDb } from '../server/syntech-db.ts';

const db = await attachSyntechDb();
try {
  const cores = await queryDb(
    db,
    `SELECT NUMERO, CAST(NOME AS VARCHAR(40)) AS NOME FROM CORES
     WHERE UPPER(CAST(NOME AS VARCHAR(40))) CONTAINING 'PIMENT'`
  );
  console.log('CORES com PIMENT*:');
  for (const r of cores) console.log(`  ${(r as { NUMERO: number }).NUMERO} | ${(r as { NOME: string }).NOME?.trim()}`);

  const modal = await queryDb(
    db,
    `SELECT CAST(T.NOME AS VARCHAR(40)) AS TIPO, CAST(C.NOME AS VARCHAR(40)) AS COR, COUNT(*) AS N
     FROM CAIXAS CX
     JOIN TIPO_FIO T ON T.CODIGO = CX.TIPO_FIO
     JOIN CORES C ON C.NUMERO = CX.COR
     WHERE UPPER(CAST(C.NOME AS VARCHAR(40))) CONTAINING 'PIMENT'
     GROUP BY T.NOME, C.NOME
     ORDER BY T.NOME`
  );
  console.log('\nCAIXAS PIMENT* por tipo:');
  for (const r of modal) {
    const row = r as { TIPO: string; COR: string; N: number };
    console.log(`  ${row.TIPO?.trim()} | ${row.COR?.trim()} (${row.N})`);
  }

  const guia = await queryDb(
    db,
    `SELECT DISTINCT CAST(G.DIREITA AS VARCHAR(40)) AS TIPO, CAST(G.ESQUERDA AS VARCHAR(40)) AS ESQ,
            CAST(G.COR_DO_FIO AS VARCHAR(40)) AS COR
     FROM GUIA_FIO G
     WHERE UPPER(CAST(G.COR_DO_FIO AS VARCHAR(40))) CONTAINING 'PIMENT'
        OR UPPER(CAST(G.DIREITA AS VARCHAR(40))) CONTAINING 'PIMENT'
        OR UPPER(CAST(G.ESQUERDA AS VARCHAR(40))) CONTAINING 'PIMENT'`
  );
  console.log('\nGUIA_FIO PIMENT*:', guia.slice(0, 15));

  const mov = await queryDb(
    db,
    `SELECT CAST(T.NOME AS VARCHAR(40)) AS TIPO, CAST(C.NOME AS VARCHAR(40)) AS COR
     FROM (
       SELECT TIPO_FIO, COR FROM RESERVA_FIOS_PROD WHERE COR IS NOT NULL
       UNION SELECT TIPO_FIO, COR FROM ITENS_PED_FIO WHERE COR IS NOT NULL
       UNION SELECT TIPO_FIO, COR FROM ENTR_CONES WHERE COR IS NOT NULL
       UNION SELECT TIPO_FIO, COR FROM QUANT_CONES WHERE COR IS NOT NULL
       UNION SELECT TIPO_FIO, COR FROM CAIXAS WHERE COR IS NOT NULL
     ) X
     JOIN TIPO_FIO T ON T.CODIGO = X.TIPO_FIO
     JOIN CORES C ON C.NUMERO = X.COR
     WHERE UPPER(CAST(C.NOME AS VARCHAR(40))) CONTAINING 'PIMENT'
     GROUP BY T.NOME, C.NOME
     ORDER BY T.NOME`
  );
  console.log('\nMovimento PIMENT* por tipo:');
  for (const r of mov) {
    const row = r as { TIPO: string; COR: string };
    console.log(`  ${row.TIPO?.trim()} | ${row.COR?.trim()}`);
  }
} finally {
  await detachDb(db);
}
