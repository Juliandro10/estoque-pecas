import {
  colorNamesMatch,
  findBestColorMatch,
  findBestYarnTypeMatch,
  yarnTypeNamesMatch,
} from '../shared/syntech-name-match.ts';
import { buildCorrectedYarnDescription, parseYarnDescription } from '../shared/yarn-description-parse.ts';

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

const parsed = parseYarnDescription('MODAL AREZO SACHE PINK 1 CABO', yarnTypes);
const corrected = buildCorrectedYarnDescription(parsed, 'MODAL AREZZO', 'SACHET PINK');
if (corrected !== 'MODAL AREZZO SACHET PINK 1 CABO') {
  console.error(`FAIL corrected description -> "${corrected}"`);
  failed++;
}

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
