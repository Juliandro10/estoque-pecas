import { summarizeYarnWeightByTypeAndColor } from '../shared/cadastro-pdf.ts';

let failed = 0;

function expectClose(label: string, actual: number, expected: number, tol = 0.001) {
  if (Math.abs(actual - expected) > tol) {
    console.error(`FAIL ${label}: got ${actual} expected ${expected}`);
    failed += 1;
  }
}

const summary = summarizeYarnWeightByTypeAndColor(
  [
    { guide: 1, tipo: 'SEPARACAO', cor: null, consumptionKg: 0.02 },
    { guide: 2, tipo: 'ELASTICO PENTE', cor: null, consumptionKg: 0.01 },
    { tipo: 'POLIESTER HB 2/28', cor: 'BRANCO', consumptionKg: 0.24 },
    { tipo: 'POLISTER HB 2/28', cor: 'BRANCO', consumptionKg: 0.05 },
    { tipo: 'LUREX FIO METALIZADO', cor: 'PRATA', consumptionKg: 0.036 },
    { tipo: 'LUREX FIO METALIZADO', cor: 'PRATA', consumptionKg: 0.008 },
    { tipo: 'LASTEX', cor: 'BRANCO', consumptionKg: 0.002 },
  ],
  0.34
);

if (summary.some((row) => /SEPARACAO|ELASTICO|PENTE|RESTO/i.test(row.tipo))) {
  console.error('FAIL waste yarns should not appear in pricing summary', summary);
  failed += 1;
}

const poly = summary.find((row) => /POLI/i.test(row.tipo));
const lurex = summary.find((row) => /LUREX/i.test(row.tipo));
if (!poly || poly.cor !== 'BRANCO') {
  console.error('FAIL polyester branco group missing', summary);
  failed += 1;
}
if (!lurex || lurex.cor !== 'PRATA') {
  console.error('FAIL lurex prata group missing', summary);
  failed += 1;
}
expectClose('poly kg', poly?.consumptionKg ?? 0, 0.29);
expectClose('lurex kg', lurex?.consumptionKg ?? 0, 0.044);
const pctSum = summary.reduce((sum, row) => sum + row.pct, 0);
expectClose('pct total', pctSum, 100, 0.05);

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
if (failed) process.exit(1);
