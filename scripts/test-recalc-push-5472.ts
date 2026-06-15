import { recalculateConsolidatedYarns } from '../server/yarn-consolidate.ts';
import { programFixedWasteYarnTotalKg, totalPartsWeight } from '../shared/yarn-consumption.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5472-CARDIGAN-CASULO-CANELADO';

const pushParts = [
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-CT.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-FT.mdv', weight_kg: '0,100' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
];

const pano = totalPartsWeight(pushParts);
const fixed = programFixedWasteYarnTotalKg();
const rows = recalculateConsolidatedYarns(modelFolder, '5472', pushParts);

let total = 0;
for (const row of rows) {
  const kg = Number(row.consumption.replace(',', '.'));
  total += kg;
  console.log(`guia ${row.guide} ${row.letter} ${row.consumption} kg (${row.pct.toFixed(2)}%)`);
}
console.log('\nPano (pesos partes):', pano.toFixed(3), 'kg');
console.log('Fixos 1-2:', fixed.toFixed(3), 'kg');
console.log('Total fio:', total.toFixed(3), 'kg');
console.log('% sobre pano:', ((total / pano) * 100).toFixed(2), '%');
console.log('Esperado pano+fixos:', (pano + fixed).toFixed(3), 'kg');
