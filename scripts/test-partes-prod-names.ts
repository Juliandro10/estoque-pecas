import {
  buildParteDisplayName,
  buildPartesProdRows,
  tempoPesoDescricao,
} from '../server/syntech-processos.ts';

const files5472 = [
  '5472-CARDIGAN-CASULO-CT.mdv',
  '5472-CARDIGAN-CASULO-FT.mdv',
  '5472-CARDIGAN-CASULO-MG.mdv',
];

console.log('TEMPO_PESO DESCRICAO (5472):\n');
for (const file of files5472) {
  console.log(`  ${file.replace('.mdv', '').padEnd(28)} → ${tempoPesoDescricao({ label: 'CARDIGAN', file_name: file })}`);
}

console.log('\n5433:\n');
for (const file of [
  '5433-BLUSA-TRANCAS-CT.mdv',
  '5433-BLUSA-TRANCAS-FT-D.mdv',
]) {
  console.log(`  ${file.replace('.mdv', '').padEnd(28)} → ${tempoPesoDescricao({ label: 'BLUSA', file_name: file })}`);
}

console.log('\n5472 PARTES_PROD:\n');
console.log(
  buildPartesProdRows(
    [
      { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-CT.mdv', weight_kg: '0,090' },
      { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-FT.mdv', weight_kg: '0,100' },
      { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
      { label: 'CARDIGAN', file_name: '5472-CARDIGAN-CASULO-MG.mdv', weight_kg: '0,090' },
    ],
    { reference: '5472', folderName: '5472-CARDIGAN-CASULO-CANELADO' }
  )
);

console.log('\nbuildParteDisplayName:');
console.log(' ', buildParteDisplayName('5472-CARDIGAN-CASULO-CT.mdv', '5472', 'CARDIGAN'));
