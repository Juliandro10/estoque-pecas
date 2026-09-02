import { replaceYarnGuideDescription } from '../shared/yarn-consumption.ts';

function setDesc(
  yarnParts: {
    key: string;
    label: string;
    file_name: string;
    guides: { guide: number; letter: string; description: string; side: 'left' | 'right' }[];
  }[],
  guide: number,
  letter: string,
  previousDescription: string,
  description: string
) {
  const letterUp = letter.toUpperCase();
  return yarnParts.map((part) => ({
    ...part,
    guides: part.guides.map((g) => {
      if (g.guide !== guide || g.letter.toUpperCase() !== letterUp) return g;
      return { ...g, description: replaceYarnGuideDescription(g.description, previousDescription, description) };
    }),
  }));
}

const yarnParts = [
  {
    key: 'CT',
    label: 'CT',
    file_name: 'X-CT.mdv',
    guides: [{ guide: 2, letter: 'B', description: 'ELASTICO DO PENTE', side: 'left' as const }],
  },
  {
    key: 'FT',
    label: 'FT',
    file_name: 'X-FT.mdv',
    guides: [{ guide: 2, letter: 'B', description: 'EALASTICO PENTE', side: 'left' as const }],
  },
];

const next = setDesc(yarnParts, 2, 'B', 'EALASTICO PENTE', 'ELASTICO DO PENTE');

if (next[0].guides[0].description !== 'ELASTICO DO PENTE') {
  console.error('FAIL CT should stay unchanged');
  process.exit(1);
}
if (next[1].guides[0].description !== 'ELASTICO DO PENTE') {
  console.error('FAIL FT should update typo row only');
  process.exit(1);
}

const blendParts = [
  {
    key: 'FT',
    label: 'FT',
    file_name: 'X-FT.mdv',
    guides: [
      {
        guide: 3,
        letter: 'C',
        description: 'POLIESTER HB 2/28 3 CABOS BRANCO + LUREX FIO METALIZADO 2 CABOS PRATA',
        side: 'right' as const,
        consumption: '0,100',
      },
    ],
  },
];
const editedBlend = setDesc(
  blendParts,
  3,
  'C',
  'LUREX FIO METALIZADO 2 CABOS PRATA',
  'LUREX FIO METALIZADO 2 CABOS FIO LUREX PRATA'
);
if (!editedBlend[0].guides[0].description.includes('FIO LUREX PRATA')) {
  console.error(`FAIL mix component edit: ${editedBlend[0].guides[0].description}`);
  process.exit(1);
}
if (!editedBlend[0].guides[0].description.includes('POLIESTER')) {
  console.error(`FAIL mix edit dropped polyester: ${editedBlend[0].guides[0].description}`);
  process.exit(1);
}

console.log('OK');
