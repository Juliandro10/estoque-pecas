import {
  colorNamesMatch,
  dedupePhantomIColors,
  findBestColorMatch,
  findBestYarnTypeMatch,
  stripPhantomColorI,
  suggestClosestColor,
  yarnTypeNamesMatch,
} from '../shared/syntech-name-match.ts';
import { buildCorrectedYarnDescription, formatYarnComponentDescription, normalizeYarnCaboSpelling, parseYarnDescription } from '../shared/yarn-description-parse.ts';

const shouldMatch: Array<[string, string]> = [
  ['SACHÉ PINK', 'SACHET PINK'],
  ['SACHE PINK', 'SACHET PINK'],
  ['SACHET PINK', 'SACHÉ PINK'],
  ['OFF WHITTE', 'OFF WHITE'],
  ['BLUESTONE', 'BLUE STONE'],
  ['MODAL AREZO', 'MODAL AREZZO'],
];

const shouldNotMatch: Array<[string, string]> = [
  ['SACHET PINK', 'FUCSIA'],
  ['SACHET PINK', 'PINK SHOK'],
  ['PINK', 'SACHET PINK'],
  ['SACHET PINK', 'ROSA TULLE'],
  ['MODAL AREZZO', 'FRESH LINE'],
];

let failed = 0;

for (const [left, right] of shouldMatch) {
  const color = colorNamesMatch(left, right);
  const yarn = yarnTypeNamesMatch(left, right);
  if (!color && !yarn) {
    console.error(`FAIL should match: "${left}" x "${right}"`);
    failed++;
  }
}

for (const [left, right] of shouldNotMatch) {
  if (colorNamesMatch(left, right)) {
    console.error(`FAIL should not match color: "${left}" x "${right}"`);
    failed++;
  }
}

const modalColors = ['ADOBE', 'MENTA', 'PIMENTA', 'SACHET PINK', 'PINK SHOK', 'ROSA TULLE'];
for (const query of ['SACHÉ PINK', 'SACHE PINK', 'SACHET PINK']) {
  const hit = findBestColorMatch(query, modalColors);
  if (hit !== 'SACHET PINK') {
    console.error(`FAIL findBestColorMatch("${query}") -> ${hit}`);
    failed++;
  }
}

if (findBestColorMatch('PINK', modalColors) !== null) {
  console.error('FAIL ambiguous PINK should not resolve');
  failed++;
}

if (findBestColorMatch('PIMENTA', modalColors) !== 'PIMENTA') {
  console.error(`FAIL PIMENTA should resolve exactly, got ${findBestColorMatch('PIMENTA', modalColors)}`);
  failed++;
}

if (colorNamesMatch('PIMENTA', 'MENTA')) {
  console.error('FAIL PIMENTA must not match MENTA');
  failed++;
}

const yarnTypes = ['FRESH LINE', 'MODAL AREZZO', 'MODAL AREZO'];
if (findBestYarnTypeMatch('MODAL AREZO SACHET PINK', yarnTypes) !== 'MODAL AREZZO') {
  console.error('FAIL yarn type prefix match');
  failed++;
}

if (!yarnTypeNamesMatch('LANTEJOLA', 'FIO LANTEJOULA')) {
  console.error('FAIL LANTEJOLA should match FIO LANTEJOULA');
  failed++;
}
if (!yarnTypeNamesMatch('FIO LANTEJOLA', 'FIO LANTEJOULA')) {
  console.error('FAIL FIO LANTEJOLA should match FIO LANTEJOULA');
  failed++;
}

if (suggestClosestColor('DOURADOI', ['DOURADO', 'PRETO']) !== 'DOURADO') {
  console.error('FAIL suggestClosestColor DOURADOI');
  failed++;
}
if (suggestClosestColor('AREIA MEDIOI', ['AREIA', 'BEGE MEDIO POLI', 'BRANCO']) !== null) {
  console.error(
    `FAIL AREIA MEDIOI should stay conferir, got ${suggestClosestColor('AREIA MEDIOI', ['AREIA', 'BEGE MEDIO POLI', 'BRANCO'])}`
  );
  failed++;
}

const parsed = parseYarnDescription('MODAL AREZO SACHE PINK 1 CABO', yarnTypes);
const corrected = buildCorrectedYarnDescription(parsed, 'MODAL AREZZO', 'SACHET PINK');
if (corrected !== 'MODAL AREZZO SACHET PINK 1 CABO') {
  console.error(`FAIL corrected description -> "${corrected}"`);
  failed++;
}

if (normalizeYarnCaboSpelling('POLISTER HB 2/28 BRANCO 3 CABO') !== 'POLISTER HB 2/28 BRANCO 3 CABOS') {
  console.error('FAIL 3 CABO should become 3 CABOS');
  failed++;
}
if (normalizeYarnCaboSpelling('LASTEX PRETO 1 CABOS') !== 'LASTEX PRETO 1 CABO') {
  console.error('FAIL 1 CABOS should become 1 CABO');
  failed++;
}
if (formatYarnComponentDescription({ tipo: 'POLISTER HB 2/28', cor: 'BRANCO', cabo: '3' }) !== 'POLISTER HB 2/28 BRANCO 3 CABOS') {
  console.error('FAIL formatted 3 cabo should be plural');
  failed++;
}

const polisterColors = ['BRANCO', 'BRANCOI', 'PRETO', 'PRETOI'];
const dedupedPolister = dedupePhantomIColors(polisterColors);
if (dedupedPolister.includes('BRANCOI') || dedupedPolister.includes('PRETOI')) {
  console.error(`FAIL dedupePhantomIColors kept phantom I colors: ${dedupedPolister.join(', ')}`);
  failed++;
}
if (findBestColorMatch('BRANCOI', dedupedPolister) !== 'BRANCO') {
  console.error(`FAIL BRANCOI should resolve to BRANCO, got ${findBestColorMatch('BRANCOI', dedupedPolister)}`);
  failed++;
}
if (stripPhantomColorI('PEACH PINKI', ['PEACH PINK', 'PINK']) !== 'PEACH PINK') {
  console.error(`FAIL stripPhantomColorI PEACH PINKI -> ${stripPhantomColorI('PEACH PINKI', ['PEACH PINK', 'PINK'])}`);
  failed++;
}

const lurexColors = ['COBRE', 'DOURADO', 'FIO LUREX PRATA', 'PRETO', 'ROSE'];
if (findBestColorMatch('PRATA', lurexColors) !== 'FIO LUREX PRATA') {
  console.error(
    `FAIL PRATA should resolve to FIO LUREX PRATA, got ${findBestColorMatch('PRATA', lurexColors)}`
  );
  failed++;
}
if (findBestColorMatch('PRATAI', lurexColors) !== 'FIO LUREX PRATA') {
  console.error(
    `FAIL PRATAI should resolve to FIO LUREX PRATA, got ${findBestColorMatch('PRATAI', lurexColors)}`
  );
  failed++;
}

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
