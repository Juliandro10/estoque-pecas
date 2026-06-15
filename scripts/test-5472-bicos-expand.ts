import { recalculateConsolidatedYarns } from '../server/yarn-consolidate.ts';
import { expandProcessYarnComponents } from '../server/yarn-blend.ts';
import { totalPartsWeight } from '../shared/yarn-consumption.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5472-CARDIGAN-CASULO-CANELADO';

const pushParts = [
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-CT.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-FT.mdv', weight_kg: '0,100' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
];

const pano = totalPartsWeight(pushParts);
const rows = recalculateConsolidatedYarns(modelFolder, '5472', pushParts);
const expanded = expandProcessYarnComponents(rows, [], [], undefined, pano);

let total = 0;
let pctSum = 0;
console.log('Bicos expandidos:\n');
for (const row of expanded) {
  total += row.consumptionKg;
  pctSum += row.pct;
  console.log(
    `  slot ${row.slot} guia ${row.guide}${row.letter ? ` ${row.letter}` : ''} ${row.consumptionKg.toFixed(3)} kg ${row.pct.toFixed(2)}%`
  );
}

console.log('\nTotal fio:', total.toFixed(3), 'kg');
console.log('Soma %:', pctSum.toFixed(2), '%');
console.log('% sobre pano:', ((total / pano) * 100).toFixed(2), '%');
