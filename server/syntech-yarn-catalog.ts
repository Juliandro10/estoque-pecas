import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { dedupePhantomIColors, findYarnTypeIndex, repairSyntechText, stripPhantomColorI } from '../shared/syntech-name-match';

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
  const text = stripPhantomColorI(repairSyntechText(cor.trim()), list);
  if (!text) return;
  const upper = normalizeName(text);
  if (list.some((item) => normalizeName(item) === upper)) return;
  list.push(text);
}

function findTypeIndex(types: SyntechYarnType[], tipoText: string) {
  return findYarnTypeIndex(tipoText, types);
}

export function readSyntechYarnCatalog(filePath = syntechYarnCatalogPath): SyntechYarnCatalogFile {
  if (!fs.existsSync(filePath)) {
    return { updated_at: '', source: '', types: [] };
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SyntechYarnCatalogFile;
  return {
    ...raw,
    types: raw.types.map((item) => ({
      ...item,
      tipo: repairSyntechText(item.tipo),
      cores: dedupePhantomIColors(item.cores.map((cor) => repairSyntechText(cor))),
    })),
  };
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
      tipo: repairSyntechText(row.NOME.trim()),
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
         UNION
         SELECT TIPO_FIO, COR FROM CAIXAS WHERE COR IS NOT NULL
       ) X
       JOIN CORES C ON C.NUMERO = X.COR
       WHERE X.TIPO_FIO IS NOT NULL
       ORDER BY X.TIPO_FIO, C.NOME`
    );

    for (const row of colorRows) {
      const item = byCodigo.get(row.TIPO_FIO);
      if (item) mergeColor(item.cores, repairSyntechText(row.COR));
    }

    const guiaRows = await queryDb<{ TIPO: string; COR: string }>(
      db,
      `SELECT DISTINCT CAST(G.DIREITA AS VARCHAR(80)) AS TIPO,
              CAST(G.COR_DO_FIO AS VARCHAR(80)) AS COR
       FROM GUIA_FIO G
       WHERE G.DIREITA IS NOT NULL AND TRIM(G.DIREITA) <> ''
         AND G.COR_DO_FIO IS NOT NULL AND TRIM(G.COR_DO_FIO) <> ''
       UNION
       SELECT DISTINCT CAST(G.ESQUERDA AS VARCHAR(80)) AS TIPO,
              CAST(G.COR_DO_FIO AS VARCHAR(80)) AS COR
       FROM GUIA_FIO G
       WHERE G.ESQUERDA IS NOT NULL AND TRIM(G.ESQUERDA) <> ''
         AND G.COR_DO_FIO IS NOT NULL AND TRIM(G.COR_DO_FIO) <> ''`
    );

    for (const row of guiaRows) {
      const index = findTypeIndex(catalogTypes, repairSyntechText(row.TIPO));
      if (index < 0) continue;
      mergeColor(catalogTypes[index].cores, repairSyntechText(row.COR));
    }

    for (const item of catalogTypes) {
      item.cores = dedupePhantomIColors(item.cores);
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
