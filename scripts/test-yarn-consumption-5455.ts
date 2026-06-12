import {
  applyAutoYarnConsumption,
  consolidateYarnParts,
  parseConsumptionInput,
} from '../src/lib/cadastro-db.ts';

const parts = [
  { key: 'CT', label: 'CT-P-4', file_name: '5455-TOP-CROCHE-LEIA-CT-P-4.mdv', time_mmss: '', weight_kg: '0,060' },
  { key: 'FT', label: 'FT-P-4', file_name: '5455-TOP-CROCHE-LEIA-FT-P-4.mdv', time_mmss: '', weight_kg: '0,060' },
];

const yarnParts = [
  {
    key: 'CT',
    label: 'CT-P-4',
    file_name: '5455-TOP-CROCHE-LEIA-CT-P-4.mdv',
    guides: [
      { guide: 1, letter: 'A', description: 'SEPARACAO', side: 'right' as const, pct: 0, consumption: '' },
      { guide: 2, letter: 'B', description: 'ELASTICO DO PENTE', side: 'right' as const, pct: 0, consumption: '' },
      { guide: 3, letter: 'C', description: '069 VISCOSTRTETCH OFF WHITTE 4 CABOSI', side: 'right' as const, pct: 58.33, consumption: '' },
      { guide: 5, letter: 'D', description: '013 LASTEX BRANCO 1 CABO', side: 'right' as const, pct: 5, consumption: '' },
    ],
  },
  {
    key: 'FT',
    label: 'FT-P-4',
    file_name: '5455-TOP-CROCHE-LEIA-FT-P-4.mdv',
    guides: [
      { guide: 1, letter: 'A', description: 'SEPARACAO', side: 'right' as const, pct: 0, consumption: '' },
      { guide: 2, letter: 'B', description: 'ELASTICO DO PENTE', side: 'right' as const, pct: 0, consumption: '' },
      { guide: 3, letter: 'C', description: '069 VISCOSTRTETCH OFF WHITTE 4 CABOSI', side: 'right' as const, pct: 58.33, consumption: '' },
      { guide: 5, letter: 'D', description: '013 LASTEX BRANCO 1 CABO', side: 'right' as const, pct: 5, consumption: '' },
      { guide: 6, letter: 'E', description: '069 VISCOSTRTETCH OFF WHITTE 4 CABOSI', side: 'right' as const, pct: 33.33, consumption: '' },
    ],
  },
];

const computed = applyAutoYarnConsumption(yarnParts, parts);
const consolidated = consolidateYarnParts(computed, parts);

console.log('Por parte — bico 5 (LASTEX):');
for (const part of computed) {
  const g5 = part.guides.find((g) => g.guide === 5);
  console.log(`  ${part.label}: ${g5?.consumption ?? '—'} (${g5?.pct}%)`);
}

const b5 = consolidated.find((row) => row.guide === 5);
const b2 = consolidated.find((row) => row.guide === 2);
console.log('\nConsolidado:');
console.log('  bico 2 (pente fixo):', b2?.consumption);
console.log('  bico 5 (lastex %):  ', b5?.consumption, `(${b5?.pct?.toFixed(2)}%)`);

const b5kg = parseConsumptionInput(b5?.consumption ?? '');
if (b5kg > 0.015) {
  console.error('\nFALHA: bico 5 ainda inflado acima de 15g total');
  process.exit(1);
}
console.log('\nOK — bico 5 não usa mínimo de 10g por pano');
