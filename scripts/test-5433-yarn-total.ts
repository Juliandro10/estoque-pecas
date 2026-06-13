import { readSinYarnForPart } from '../server/sin-yarn.ts';

const FIXED = { 1: 0.02, 2: 0.01 };

function partBase(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim().toUpperCase();
}

function labelMatch(partLabel: string, yarnLabel: string) {
  const a = partLabel.trim().toUpperCase();
  const b = yarnLabel.trim().toUpperCase();
  if (a === b) return true;
  if (a.endsWith('-M') && b.endsWith('-MG') && a + 'G' === b) return true;
  if (b.endsWith('-M') && a.endsWith('-MG') && b + 'G' === a) return true;
  return false;
}

function fileMatch(partFile: string, yarnFile: string) {
  if (partFile === yarnFile) return true;
  if (partFile.endsWith('-M') && yarnFile.endsWith('-MG') && partFile + 'G' === yarnFile) return true;
  if (yarnFile.endsWith('-M') && partFile.endsWith('-MG') && yarnFile + 'G' === partFile) return true;
  return false;
}

function matches(
  part: { label: string; file_name: string },
  yarn: { label: string; file_name: string }
) {
  const pf = partBase(part.file_name);
  const yf = partBase(yarn.file_name);
  if (pf && yf && fileMatch(pf, yf)) return true;
  return labelMatch(part.label, yarn.label);
}

function weightForYarn(
  parts: { label: string; file_name: string; weight_kg: string }[],
  yarn: { label: string; file_name: string }
) {
  return parts
    .filter((p) => matches(p, yarn))
    .reduce((s, p) => s + Number(p.weight_kg.replace(',', '.') || 0), 0);
}

function wastePct(guides: { guide: number; pct?: number }[]) {
  return guides
    .filter((g) => g.guide === 1 || g.guide === 2)
    .reduce((s, g) => s + (g.pct ?? 0), 0);
}

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const parts = [
  { label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv', weight_kg: '0,160' },
  { label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv', weight_kg: '0,160' },
  { label: 'BLUSA-TRANCAS-M', file_name: '5433-BLUSA-TRANCAS-MG.mdv', weight_kg: '0,140' },
  { label: 'BLUSA-TRANCAS-M', file_name: '5433-BLUSA-TRANCAS-MG.mdv', weight_kg: '0,140' },
];

const yarnParts = [
  { label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv' },
  { label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv' },
  { label: 'BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv' },
];

const pano = parts.reduce((s, p) => s + Number(p.weight_kg.replace(',', '.')), 0);
let knitting = 0;

for (const yp of yarnParts) {
  const w = weightForYarn(parts, yp);
  const sin = readSinYarnForPart(modelFolder, partBase(yp.file_name));
  const fabricBase = Math.max(0, 100 - wastePct(sin.guides));
  let partKnit = 0;
  for (const g of sin.guides) {
    if (g.guide === 1 || g.guide === 2) continue;
    partKnit += w * ((g.pct ?? 0) / fabricBase);
  }
  console.log(`${yp.label} weight=${w.toFixed(3)} knitting=${partKnit.toFixed(3)} (base ${fabricBase.toFixed(1)}%)`);
  knitting += partKnit;
}

const fixos = FIXED[1] + FIXED[2];
const total = knitting + fixos;
const pctSum = pano > 0 ? (total / pano) * 100 : 0;

console.log('\nPano', pano.toFixed(3), 'kg');
console.log('Tecido calculado', knitting.toFixed(3), 'kg');
console.log('Fixos', fixos.toFixed(3), 'kg');
console.log('Total fio', total.toFixed(3), 'kg (esperado ~0,630)');
console.log('% sobre pano', pctSum.toFixed(2), '% (esperado ~105)');
