import { yarnFioIdentityKey } from '../shared/yarn-consumption.ts';

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
  const identity = yarnFioIdentityKey(previousDescription);
  return yarnParts.map((part) => ({
    ...part,
    guides: part.guides.map((g) => {
      if (g.guide !== guide || g.letter.toUpperCase() !== letterUp) return g;
      if (yarnFioIdentityKey(g.description) !== identity) return g;
      return { ...g, description };
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

console.log('OK');
