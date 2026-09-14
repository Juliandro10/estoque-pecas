import fs from 'node:fs';
import path from 'node:path';

import {
  LANTEJOULA_WEIGHT_FACTOR,
  expandProcessYarnComponents,
  splitComponentWeightShares,
} from '../shared/yarn-blend-core.ts';
import { parseYarnDescriptionComponents } from '../shared/yarn-description-parse.ts';

let failed = 0;

function expectClose(label: string, actual: number, expected: number, tol = 0.001) {
  if (Math.abs(actual - expected) > tol) {
    console.error(`FAIL ${label}: got ${actual} expected ${expected}`);
    failed += 1;
  }
}

const catalogPath = path.join(process.cwd(), 'data', 'syntech-fios.json');
const yarnTypes = (
  JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as { types: { tipo: string }[] }
).types.map((item) => item.tipo);

function checkBlend(label: string, description: string, partner: RegExp) {
  const blend = parseYarnDescriptionComponents(description, yarnTypes);
  if (blend.length !== 2) {
    console.error(`FAIL ${label} parse: ${JSON.stringify(blend)}`);
    failed += 1;
    return;
  }
  const shares = splitComponentWeightShares(blend);
  const lanteIdx = blend.findIndex((row) => /LANTEJOU?LA|PAETE/i.test(`${row.tipo} ${row.raw}`));
  const partnerIdx = blend.findIndex((row) => partner.test(`${row.tipo} ${row.raw}`));
  expectClose(`${label} lantejoula share`, shares[lanteIdx], 2.5 / 3.5);
  expectClose(`${label} partner share`, shares[partnerIdx], 1 / 3.5);

  const expanded = expandProcessYarnComponents(
    [
      {
        guide: 3,
        letter: 'C',
        description,
        consumption: '0,150',
        pct: 100,
      },
    ],
    {},
    yarnTypes
  );
  const lanteKg = expanded
    .filter((row) => /LANTEJOU?LA|PAETE/i.test(row.description))
    .reduce((sum, row) => sum + row.consumptionKg, 0);
  const partnerKg = expanded
    .filter((row) => partner.test(row.description))
    .reduce((sum, row) => sum + row.consumptionKg, 0);
  expectClose(`${label} lantejoula kg`, lanteKg, 0.107);
  expectClose(`${label} partner kg`, partnerKg, 0.043);
}

checkBlend(
  '5612 poli',
  'FIO LANTEJOULA OFF LANTEJOULA 1 CABO + POLISTER HB 2/28 BRANCO 1 CABO',
  /POLI/i
);
checkBlend(
  '5612 linha 2/28',
  'FIO LANTEJOULA OFF LANTEJOULA 1 CABO + LINHA 2/28 BRANCO 1 CABO',
  /LINHA/i
);

expectClose('factor', LANTEJOULA_WEIGHT_FACTOR, 2.5);

const screenshot = expandProcessYarnComponents(
  [
    {
      guide: 3,
      letter: 'C',
      description: 'FIO LANTEJOULA DOURADO 1 CABO + POLISTER HB 2/28 BEGE MEDIO 1 CABO',
      consumption: '0,268',
      pct: 78.82,
    },
  ],
  {},
  yarnTypes
);
const lanteShot = screenshot.find((row) => /LANTEJOU?LA/i.test(row.description));
const poliShot = screenshot.find((row) => /POLI/i.test(row.description));
expectClose('tela 5612 lantejoula kg', lanteShot?.consumptionKg ?? 0, 0.191);
expectClose('tela 5612 poli kg', poliShot?.consumptionKg ?? 0, 0.077);

const pdfSemCatalogo = expandProcessYarnComponents(
  [
    {
      guide: 3,
      letter: 'C',
      description: 'FIO LANTEJOULA DOURADO 1 CABO + POLISTER HB 2/28 BEGE MEDIO 1 CABO',
      consumption: '0,268',
      pct: 78.82,
    },
  ],
  {}
);
const lantePdf = pdfSemCatalogo.find((row) => /LANTEJOU?LA/i.test(`${row.tipo} ${row.description}`));
const poliPdf = pdfSemCatalogo.find((row) => /POLI/i.test(`${row.tipo} ${row.description}`));
expectClose('pdf sem catálogo lantejoula kg', lantePdf?.consumptionKg ?? 0, 0.191);
expectClose('pdf sem catálogo poli kg', poliPdf?.consumptionKg ?? 0, 0.077);

checkBlend(
  'pdf 5612 grafia LANTEJOLA',
  'FIO LANTEJOLA 1 CABO DOURADO + POLIESTER HB 2/28 1 CABO AREIA MEDIO',
  /POLI/i
);

console.log(
  failed === 0
    ? `OK lantejoula factor ${LANTEJOULA_WEIGHT_FACTOR} · 1+1 cabo → 2,5 / 3,5`
    : `${failed} failure(s)`
);
if (failed) process.exit(1);
