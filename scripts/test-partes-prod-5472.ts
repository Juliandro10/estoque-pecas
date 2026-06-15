import { buildPartesProdRows, buildParteDisplayName } from '../server/syntech-processos.ts';

const folder = '5472-CARDIGAN-CASULO-CANELADO';
const ref = '5472';

const files = [
  '5472-CARDIGAN-CASULO-CT.mdv',
  '5472-CARDIGAN-CASULO-FT.mdv',
  '5472-CARDIGAN-CASULO-MG.mdv',
];

console.log('buildParteDisplayName:');
for (const file of files) {
  console.log(`  ${file} → ${buildParteDisplayName(file, ref, 'CARDIGAN')}`);
}

const pushParts = [
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-CT.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-FT.mdv', weight_kg: '0,100' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
  { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
];

console.log('\nPARTES_PROD:');
console.log(buildPartesProdRows(pushParts, { reference: ref, folderName: folder }));
