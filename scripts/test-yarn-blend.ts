import fs from 'node:fs';
import path from 'node:path';

import { parseYarnDescriptionComponents } from '../server/yarn-description-parse.ts';
import {
  allocateBicoSlots,
  expandProcessYarnComponents,
  splitComponentWeightShares,
} from '../server/yarn-blend.ts';

const catalogPath = path.join(process.cwd(), 'data', 'syntech-fios.json');
const yarnTypes = (JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { types: { tipo: string }[] }).types.map(
  (item) => item.tipo
);

const samples = [
  'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
  'ELASTANO BRANCO 3 CABOS + LINHA SNOW 1 CABO',
  '013 LASTEX BRANCO 1 CABO',
];

console.log('parseYarnDescriptionComponents');
for (const sample of samples) {
  console.log(sample);
  console.log(' ->', parseYarnDescriptionComponents(sample, yarnTypes));
}

const capriceLinha = parseYarnDescriptionComponents(
  'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
  yarnTypes
);
console.log('\nPeso relativo CAPRICE + LINHA (1+1 cabo, fator 2.5):');
console.log(splitComponentWeightShares(capriceLinha).map((share) => `${Math.round(share * 1000) / 10}%`));

console.log('\nSlots — guias 1,2,3(mistura),6(mistura),7:');
console.log(
  allocateBicoSlots([
    { guide: 1, count: 1 },
    { guide: 2, count: 1 },
    { guide: 3, count: 2 },
    { guide: 6, count: 2 },
    { guide: 7, count: 1 },
  ])
);

console.log('\nProcessos Fábrica expandido (5472 simulado):');
const rows = expandProcessYarnComponents(
  [
    { guide: 1, description: 'SEPARACAO', consumption: '0,020', pct: 0 },
    { guide: 2, description: 'ELASTICO PENTE', consumption: '0,010', pct: 0 },
    { guide: 3, description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO', consumption: '0,120', pct: 40 },
    { guide: 6, description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO', consumption: '0,080', pct: 27 },
    { guide: 7, description: 'ELASTANO BRANCO 3 CABOS + LINHA SNOW 1 CABO', consumption: '0,050', pct: 17 },
  ],
  [],
  yarnTypes
);

for (const row of rows) {
  console.log(
    `slot ${row.slot} | BICO ${row.guide} | ${row.description} | ${row.consumptionKg} kg | ${row.pct}% | cabo ${row.cabo}`
  );
}
