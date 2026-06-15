import { mergeSavedPartsWithFolder, partKindToken } from '../src/lib/cadastro-db.ts';

console.log('partKindToken:');
for (const name of [
  '5455-TOP-CROCHE-LEIA-CT-P-4.mdv',
  '5455-TOP-CROCHE-LEIA-CT.mdv',
  'CT-P-4',
]) {
  console.log(`  ${name.padEnd(42)} → ${partKindToken(name)}`);
}

const saved = [
  {
    key: 'CT-P-4',
    label: 'CT-P-4',
    file_name: '5455-TOP-CROCHE-LEIA-CT-P-4.mdv',
    time_mmss: '05:08',
    weight_kg: '0,040',
  },
  {
    key: 'FT-P-4',
    label: 'FT-P-4',
    file_name: '5455-TOP-CROCHE-LEIA-FT-P-4.mdv',
    time_mmss: '13:23',
    weight_kg: '0,080',
  },
];

const folder = [
  { key: 'CT', label: 'CT', file_name: '5455-TOP-CROCHE-LEIA-CT.mdv' },
  { key: 'FT', label: 'FT', file_name: '5455-TOP-CROCHE-LEIA-FT.mdv' },
];

const { parts, updated } = mergeSavedPartsWithFolder(saved, folder);
console.log('\nmergeSavedPartsWithFolder:', { updated });
for (const part of parts) {
  console.log(`  ${part.label} | ${part.file_name} | ${part.time_mmss} | ${part.weight_kg}`);
}
