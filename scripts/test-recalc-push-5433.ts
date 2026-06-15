import { recalculateConsolidatedYarns } from '../server/yarn-consolidate.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const pushParts = [
  { label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv', time_mmss: '07:58', weight_kg: '0,160' },
  { label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv', time_mmss: '09:09', weight_kg: '0,160' },
  { label: 'BLUSA-TRAN', file_name: '5433-BLUSA-TRANCAS-MG.mdv', time_mmss: '05:42', weight_kg: '0,140' },
  { label: 'BLUSA-TRAN', file_name: '5433-BLUSA-TRANCAS-MG.mdv', time_mmss: '05:42', weight_kg: '0,140' },
];

const rows = recalculateConsolidatedYarns(modelFolder, '5433', pushParts);
let total = 0;
for (const row of rows) {
  const kg = Number(row.consumption.replace(',', '.'));
  total += kg;
  console.log(`guia ${row.guide} ${row.letter} ${row.consumption} kg (${row.pct.toFixed(2)}%)`);
}
console.log('\nTotal', total.toFixed(3), 'kg');
console.log('% pano', ((total / 0.6) * 100).toFixed(2), '%');
