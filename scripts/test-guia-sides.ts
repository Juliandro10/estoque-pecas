import { consolidateYarnParts, yarnFioIdentityKey } from '../shared/yarn-consumption.ts';
import { allocateBicoSlots, expandProcessYarnComponents } from '../shared/yarn-blend-core.ts';
import { bicoProcessoLabel, compactGuiaSideNote } from '../shared/guia-fio-text.ts';

let failed = 0;

function expect(label: string, actual: string, expected: string) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: got "${actual}" expected "${expected}"`);
    failed += 1;
  }
}

expect(
  'SUCO vs TABUA',
  yarnFioIdentityKey('POWER BRIGHT 1 CABO SUCO') === yarnFioIdentityKey('POWER BRIGHT 1 CABO TABUA')
    ? 'same'
    : 'diff',
  'diff'
);
expect(
  'TERRAI vs TERRA',
  yarnFioIdentityKey('POWER BRIGHT 1 CABO MARRON TERRAI') ===
    yarnFioIdentityKey('POWER BRIGHT 1 CABO MARRON TERRA')
    ? 'same'
    : 'diff',
  'same'
);

const yarnParts = [
  {
    label: 'TOP-LISTRAS-FT',
    file_name: '5559-TOP-LISTRAS-FT.mdv',
    guides: [
      {
        guide: 8,
        letter: 'M',
        description: 'POWER BRIGHT 1 CABO SUCO',
        side: 'left' as const,
        consumption: '0,010',
      },
      {
        guide: 8,
        letter: 'N',
        description: 'POWER BRIGHT 1 CABO TABUA',
        side: 'right' as const,
        consumption: '0,050',
      },
    ],
  },
  {
    label: 'TOP-LISTRAS-CT',
    file_name: '5559-TOP-LISTRAS-CT.mdv',
    guides: [
      {
        guide: 8,
        letter: 'I',
        description: 'POWER BRIGHT 1 CABO TABUA',
        side: 'right' as const,
        consumption: '0,040',
      },
    ],
  },
  {
    label: 'TOP-LISTRAS-ACAB',
    file_name: '5559-TOP-LISTRAS-ACAB.mdv',
    guides: [
      {
        guide: 8,
        letter: 'D',
        description: 'ELASTANO 20/20 2 CABOS PRETO',
        side: 'right' as const,
        consumption: '0,002',
      },
    ],
  },
];

const parts = yarnParts.map((part) => ({
  label: part.label,
  file_name: part.file_name,
  weight_kg: '0,160',
}));

const consolidated = consolidateYarnParts(yarnParts, parts);
const guide8 = consolidated.filter((row) => row.guide === 8);
if (guide8.length !== 3) {
  console.error(`FAIL guide 8 rows: ${guide8.length} expected 3`, guide8);
  failed += 1;
}

const expanded = expandProcessYarnComponents(
  guide8.map((row) => ({
    guide: row.guide,
    letter: row.letter,
    description: row.description,
    consumption: row.consumption,
    pct: row.pct,
    side: row.side,
    parts: row.parts,
  }))
);

const native = expanded.find((row) => row.slot === 8);
if (!native || !/TABUA/i.test(native.description)) {
  console.error(`FAIL native slot 8 should be TABUA, got ${native?.description} slot ${native?.slot}`);
  failed += 1;
}

const expandedSlots = expanded.map((row) => row.slot);
if (new Set(expandedSlots).size !== expandedSlots.length) {
  console.error(`FAIL duplicate slots on guide 8: ${expandedSlots.join(', ')}`);
  failed += 1;
}

const siblings = expanded.map((row) => ({
  guide: row.guide,
  slot: row.slot,
  letter: row.letter,
  side: row.side,
  parts: row.parts,
  componentIndex: row.componentIndex,
}));

function labelOf(pattern: RegExp) {
  const row = expanded.find((item) => pattern.test(item.description));
  if (!row) return '';
  return bicoProcessoLabel(
    {
      guide: row.guide,
      slot: row.slot,
      letter: row.letter,
      side: row.side,
      parts: row.parts,
      componentIndex: row.componentIndex,
    },
    siblings
  );
}

expect('label TABUA', labelOf(/TABUA/i), 'BICO 8 DIR');
expect('label SUCO', labelOf(/SUCO/i), 'BICO 8 ESQ');
expect('label ELASTANO', labelOf(/ELASTANO/i), 'BICO 8 ACAB');

const labels = [labelOf(/TABUA/i), labelOf(/SUCO/i), labelOf(/ELASTANO/i)];
if (new Set(labels).size !== labels.length) {
  console.error(`FAIL duplicate processo labels: ${labels.join(', ')}`);
  failed += 1;
}

const note = compactGuiaSideNote([
  { description: 'POWER BRIGHT 1 CABO TABUA', parts: ['FT', 'CT'] },
  { description: 'ELASTANO 20/20 2 CABOS PRETO', parts: ['ACAB'] },
]);
if (note.length > 40) {
  console.error(`FAIL compact note too long (${note.length}): ${note}`);
  failed += 1;
}
if (!/TABUA/i.test(note) || !/ELAST/i.test(note) || !/ACAB/i.test(note)) {
  console.error(`FAIL compact note missing pieces: ${note}`);
  failed += 1;
}

const blendSlots = allocateBicoSlots([
  { guide: 3, letter: 'C', count: 2, description: 'CAPRICE + LINHA' },
  { guide: 6, letter: 'A', count: 1, description: 'LINHA' },
]);
if (blendSlots.get('3:C:CAPRICE + LINHA:1') === undefined) {
  console.error('FAIL blend still needs extra slot');
  failed += 1;
}

const reusedLetter = expandProcessYarnComponents([
  {
    guide: 2,
    letter: 'B',
    description: 'ELASTICO PENTE',
    consumption: '0,010',
    side: 'right',
    parts: ['FT'],
  },
  {
    guide: 2,
    letter: 'B',
    description: 'LASTEX 1 CABO PRETO',
    consumption: '0,005',
    side: 'left',
    parts: ['CT'],
  },
  {
    guide: 4,
    letter: 'E',
    description: 'NUVEM 1 CABO',
    consumption: '0,020',
    side: 'left',
    parts: ['FT'],
  },
  {
    guide: 4,
    letter: 'E',
    description: 'UNA 1 CABO',
    consumption: '0,020',
    side: 'right',
    parts: ['FT', 'CT'],
  },
]);
const reusedSlots = reusedLetter.map((row) => row.slot);
if (new Set(reusedSlots).size !== reusedSlots.length) {
  console.error(`FAIL reused letter duplicate slots: ${reusedSlots.join(', ')}`);
  failed += 1;
}
const elastico = reusedLetter.find((row) => /ELASTICO/i.test(row.description));
const lastex = reusedLetter.find((row) => /LASTEX/i.test(row.description));
const una = reusedLetter.find((row) => /UNA/i.test(row.description));
const nuvem = reusedLetter.find((row) => /NUVEM/i.test(row.description));
if (elastico?.slot !== 2) {
  console.error(`FAIL native slot 2 should be ELASTICO DIR, got ${elastico?.slot}`);
  failed += 1;
}
if (lastex?.slot === 2) {
  console.error(`FAIL LASTEX ESQ should overflow, got slot ${lastex?.slot}`);
  failed += 1;
}
if (una?.slot !== 4) {
  console.error(`FAIL native slot 4 should be UNA DIR, got ${una?.slot}`);
  failed += 1;
}
if (nuvem?.slot === 4) {
  console.error(`FAIL NUVEM ESQ should overflow, got slot ${nuvem?.slot}`);
  failed += 1;
}

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
if (failed) process.exit(1);
