import fs from 'node:fs';
import path from 'node:path';

import { buildGuiaFioRows } from '../server/syntech-guia-fio.ts';
import { parseYarnDescription } from '../server/yarn-description-parse.ts';

const catalogPath = path.join(process.cwd(), 'data', 'syntech-fios.json');
const yarnTypes = (JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { types: { tipo: string }[] }).types.map(
  (item) => item.tipo
);

const samples = [
  'POWER BRIGHT 1 CABO NATURAL',
  '013 LASTEX BRANCO 1 CABO',
  '013 LASTEX 1 CABO',
  '069 VISCOSTRTETCH OFF WHITTE 4 CABOSI',
  '069 VISCOSTRTETCH 4 CABOS',
  'MESCLA SHINE 1 CABO SWAROVISK',
  'SEPARACAO',
  'ELASTICO DO PENTE',
];

console.log('parseYarnDescription');
for (const sample of samples) {
  console.log(sample, '->', parseYarnDescription(sample, yarnTypes));
}

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/LEZ A LEZ/5455-TOP-CROCHE-LEIA';
const rows = buildGuiaFioRows(modelFolder, ['5455-TOP-CROCHE-LEIA-CT-P-4.mdv']);
console.log('\n5455 GUIA_FIO');
for (const row of rows.filter((item) => item.direita || item.esquerda)) {
  console.log(row);
}
