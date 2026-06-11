import fs from 'node:fs';

import { parseYarnGuidesFromSin } from '../server/sin-yarn.ts';

const sample =
  process.argv[2] ??
  'C:\\Users\\Tricot&Cia\\Desktop\\PROGRAMAS\\PROGRAMAS-POR-CLIENTE\\ANIMALE\\5469-POLO-LISTRADA-VITORIA\\dados do programa\\5469-POLO-LISTRADA-VITORIA-CT\\5469-POLO-LISTRADA-VITORIA-CT.sin';

const text = fs.readFileSync(sample, 'utf8');
const parsed = parseYarnGuidesFromSin(text);

console.log('ygc', parsed.ygc);
console.log('ydf', parsed.ydf);
console.log('guias', parsed.guides.length);
for (const guide of parsed.guides) {
  console.log(`${guide.side.padEnd(5)} ${guide.guide}=${guide.letter} ${guide.description}`);
}
