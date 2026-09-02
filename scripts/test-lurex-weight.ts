import {
  LUREX_WEIGHT_FACTOR,
  expandProcessYarnComponents,
  fabricGuideWeightShare,
  splitComponentWeightShares,
} from '../shared/yarn-blend-core.ts';
import { parseYarnDescriptionComponents } from '../shared/yarn-description-parse.ts';

let failed = 0;

function expectClose(label: string, actual: number, expected: number, tol = 0.004) {
  if (Math.abs(actual - expected) > tol) {
    console.error(`FAIL ${label}: got ${actual} expected ${expected}`);
    failed += 1;
  }
}

const blend = parseYarnDescriptionComponents(
  'POLIESTER HB 2/28 3 CABOS BRANCO + LUREX FIO METALIZADO 2 CABOS PRATA'
);
if (blend.length !== 2) {
  console.error(`FAIL blend parse: ${blend.length} components`);
  failed += 1;
}

const shares = splitComponentWeightShares(blend);
const polyShare = shares[blend.findIndex((row) => /POLI/i.test(row.tipo))];
const lurexShare = shares[blend.findIndex((row) => /LUREX/i.test(row.tipo))];
expectClose('lurex share 5604', lurexShare, 0.044 / (0.044 + 0.296));
expectClose('poly share 5604', polyShare, 0.296 / (0.044 + 0.296));

const expanded = expandProcessYarnComponents([
  {
    guide: 3,
    letter: 'C',
    description: 'POLIESTER HB 2/28 3 CABOS BRANCO + LUREX FIO METALIZADO 2 CABOS PRATA',
    consumption: '0,337',
    pct: 99,
  },
]);
const lurexKg = expanded
  .filter((row) => /LUREX/i.test(row.description))
  .reduce((sum, row) => sum + row.consumptionKg, 0);
const polyKg = expanded
  .filter((row) => /POLI/i.test(row.description))
  .reduce((sum, row) => sum + row.consumptionKg, 0);
expectClose('lurex kg', lurexKg, 0.044);
expectClose('poly kg', polyKg, 0.296);

const blendGuideShare = fabricGuideWeightShare({
  guide: 3,
  pct: 80,
  description: 'POLIESTER HB 2/28 3 CABOS BRANCO + LUREX FIO METALIZADO 2 CABOS PRATA',
});
const asIfAllLurex = 80 * 3 * LUREX_WEIGHT_FACTOR;
if (Math.abs(blendGuideShare - asIfAllLurex) < 1) {
  console.error(`FAIL blend guide must not use lurex factor on the whole bar: ${blendGuideShare}`);
  failed += 1;
}

console.log(
  failed === 0
    ? `OK lurex factor ${LUREX_WEIGHT_FACTOR.toFixed(3)} · mistura 3+2 → ${(lurexShare * 100).toFixed(1)}% lurex`
    : `${failed} failure(s)`
);
if (failed) process.exit(1);
