import fs from 'node:fs';

import { parseYarnUsageFromSimx } from '../server/simx-yarn.ts';
import { readSinYarnForPart } from '../server/sin-yarn.ts';

const simx =
  process.argv[2] ??
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-CT.simx';

const text = fs.readFileSync(simx, 'utf8');
const usage = parseYarnUsageFromSimx(text);
console.log('total units', usage.total_units);
for (const row of usage.by_letter) {
  console.log(row.letter, row.pct.toFixed(2) + '%');
}

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';
const row = readSinYarnForPart(folder, '5469-POLO-LISTRADA-VITORIA-CT');
console.log('\nCT guides with pct');
for (const g of row.guides) {
  console.log(g.guide, g.letter, g.description.slice(0, 30), g.pct?.toFixed(2) + '%');
}
