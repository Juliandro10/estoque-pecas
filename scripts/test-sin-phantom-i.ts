import { parseYarnGuidesFromSin } from '../server/sin-yarn.ts';
import { resolveYarnRow } from '../src/lib/syntech-yarn-match.ts';
import { readSyntechYarnCatalog } from '../server/syntech-yarn-catalog.ts';

let failed = 0;

function expect(label: string, actual: string, expected: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: got "${actual}" expected "${expected}"`);
    failed++;
  }
}

const sinSnippet = `
1 YGC: test
1 C  LEFT I RIGHT
1 C  5=E POLIESTER HB 2/28 3 CABOS BRANCOI I 6=F MONTE BLANC 1 CABO PINK
1 C  3=C 069 VISCOSTRTETCH OFF WHITTE 4 CABOSI I 5=D YORK SOFT 3 CABOS TOMATE
`;

const guides = parseYarnGuidesFromSin(sinSnippet).guides;
const guide5 = guides.find((item) => item.guide === 5);
const guide3 = guides.find((item) => item.guide === 3);
const catalog = readSyntechYarnCatalog();

expect('sin guide 5 color', guide5?.description ?? '', 'POLIESTER HB 2/28 3 CABOS BRANCO');
if (guide3?.description.includes('CABOSI')) {
  console.error(`FAIL sin guide 3 still has CABOSI: ${guide3.description}`);
  failed++;
}

const resolved5 = resolveYarnRow(
  {
    guide: 5,
    letter: 'E',
    description: guide5?.description ?? '',
    pct: 10,
    consumption: '0.01',
    parts: ['CT'],
  },
  catalog
);
expect('resolve BRANCO cor', resolved5.cor ?? '', 'BRANCO');
if (resolved5.description.includes('BRANCOI')) {
  console.error(`FAIL resolved description still has BRANCOI: ${resolved5.description}`);
  failed++;
}

const resolved3 = resolveYarnRow(
  {
    guide: 3,
    letter: 'C',
    description: guide3?.description ?? '',
    pct: 10,
    consumption: '0.01',
    parts: ['CT'],
  },
  catalog
);
expect('resolve CABOSI cor', resolved3.cor ?? '', 'OFF WHITE');

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
