import { consolidateYarnParts } from '../shared/yarn-consumption.ts';

const parts = [
  { label: 'GOLA', file_name: 'T-GOLA.mdv', weight_kg: '0,050' },
  { label: 'CT', file_name: 'T-CT.mdv', weight_kg: '0,100' },
];

console.log('=== mesmo guia, mesma cor, letras diferentes → 1 linha ===');
const sameColor = consolidateYarnParts(
  [
    {
      label: 'GOLA',
      file_name: 'T-GOLA.mdv',
      guides: [
        {
          guide: 5,
          letter: 'C',
          description: 'POWER BRIGHT TOMATE 1 CABO',
          consumption: '0,013',
        },
      ],
    },
    {
      label: 'CT',
      file_name: 'T-CT.mdv',
      guides: [
        {
          guide: 5,
          letter: 'E',
          description: 'POWER BRIGHT TOMATE 1 CABO',
          consumption: '0,087',
        },
      ],
    },
  ],
  parts
);
console.log(sameColor);
if (sameColor.filter((row) => row.guide === 5).length !== 1) {
  console.error('FAIL merge same color');
  process.exit(1);
}

console.log('\n=== mesmo guia, cores diferentes → 2 linhas ===');
const diffColor = consolidateYarnParts(
  [
    {
      label: 'GOLA',
      file_name: 'T-GOLA.mdv',
      guides: [
        {
          guide: 5,
          letter: 'C',
          description: 'POWER BRIGHT TOMATE 1 CABO',
          consumption: '0,013',
        },
      ],
    },
    {
      label: 'CT',
      file_name: 'T-CT.mdv',
      guides: [
        {
          guide: 5,
          letter: 'E',
          description: 'POWER BRIGHT NATURAL 1 CABO',
          consumption: '0,087',
        },
      ],
    },
  ],
  parts
);
console.log(diffColor);
if (diffColor.filter((row) => row.guide === 5).length !== 2) {
  console.error('FAIL should not merge different colors');
  process.exit(1);
}

console.log('\nOK');
