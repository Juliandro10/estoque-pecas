import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { attachSyntechDb, detachDb, queryDb } from './syntech-db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const syntechYarnCatalogPath = path.join(__dirname, '..', 'data', 'syntech-fios.json');

export type SyntechYarnType = {
  codigo: number;
  tipo: string;
  cores: string[];
};

export type SyntechYarnCatalogFile = {
  updated_at: string;
  source: string;
  types: SyntechYarnType[];
};

function normalizeName(value: string) {
  return value.trim().toUpperCase();
}

function mergeColor(list: string[], cor: string) {
  const text = cor.trim();
  if (!text) return;
  const upper = normalizeName(text);
  if (list.some((item) => normalizeName(item) === upper)) return;
  list.push(text);
}

function findTypeIndex(types: SyntechYarnType[], tipoText: string) {
  const tipo = normalizeName(tipoText);
  if (!tipo) return -1;

  const exact = types.findIndex((item) => normalizeName(item.tipo) === tipo);
  if (exact >= 0) return exact;

  let best = -1;
  let bestLen = 0;
  for (let index = 0; index < types.length; index++) {
    const token = normalizeName(types[index].tipo);
    if (!token) continue;
    if (!tipo.includes(token) && !token.includes(tipo)) continue;
    if (token.length > bestLen) {
      best = index;
      bestLen = token.length;
    }
  }
  return best;
}

export function readSyntechYarnCatalog(filePath = syntechYarnCatalogPath): SyntechYarnCatalogFile {
  if (!fs.existsSync(filePath)) {
    return { updated_at: '', source: '', types: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as SyntechYarnCatalogFile;
}

export function writeSyntechYarnCatalog(catalog: SyntechYarnCatalogFile, filePath = syntechYarnCatalogPath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8');
}

export async function syncSyntechYarnCatalogFromDb(): Promise<SyntechYarnCatalogFile> {
  const db = await attachSyntechDb();

  try {
    const types = await queryDb<{ CODIGO: number; NOME: string }>(
      db,
      'SELECT CODIGO, NOME FROM TIPO_FIO ORDER BY CODIGO'
    );

    const catalogTypes: SyntechYarnType[] = types.map((row) => ({
      codigo: row.CODIGO,
      tipo: row.NOME.trim(),
      cores: [],
    }));

    const byCodigo = new Map(catalogTypes.map((row) => [row.codigo, row]));

    const colorRows = await queryDb<{ TIPO_FIO: number; COR: string }>(
      db,
      `SELECT DISTINCT X.TIPO_FIO, CAST(C.NOME AS VARCHAR(80)) AS COR
       FROM (
         SELECT TIPO_FIO, COR FROM RESERVA_FIOS_PROD WHERE COR IS NOT NULL
         UNION
         SELECT TIPO_FIO, COR FROM ITENS_PED_FIO WHERE COR IS NOT NULL
         UNION
         SELECT TIPO_FIO, COR FROM ENTR_CONES WHERE COR IS NOT NULL
         UNION
         SELECT TIPO_FIO, COR FROM QUANT_CONES WHERE COR IS NOT NULL
       ) X
       JOIN CORES C ON C.NUMERO = X.COR
       WHERE X.TIPO_FIO IS NOT NULL
       ORDER BY X.TIPO_FIO, C.NOME`
    );

    for (const row of colorRows) {
      const item = byCodigo.get(row.TIPO_FIO);
      if (item) mergeColor(item.cores, row.COR);
    }

    const guiaRows = await queryDb<{ TIPO: string; COR: string }>(
      db,
      `SELECT DISTINCT CAST(G.DIREITA AS VARCHAR(80)) AS TIPO,
              CAST(G.COR_DO_FIO AS VARCHAR(80)) AS COR
       FROM GUIA_FIO G
       WHERE G.DIREITA IS NOT NULL AND TRIM(G.DIREITA) <> ''
         AND G.COR_DO_FIO IS NOT NULL AND TRIM(G.COR_DO_FIO) <> ''`
    );

    for (const row of guiaRows) {
      const index = findTypeIndex(catalogTypes, row.TIPO);
      if (index < 0) continue;
      mergeColor(catalogTypes[index].cores, row.COR);
    }

    for (const item of catalogTypes) {
      item.cores.sort((a, b) => a.localeCompare(b, 'pt-BR'));
    }

    const catalog: SyntechYarnCatalogFile = {
      updated_at: new Date().toISOString(),
      source: process.env.SYNTECH_FB_DATABASE ?? 'C:\\Textil\\Empresas\\FABRICA.MDB',
      types: catalogTypes,
    };

    writeSyntechYarnCatalog(catalog);
    return catalog;
  } finally {
    await detachDb(db);
  }
}
