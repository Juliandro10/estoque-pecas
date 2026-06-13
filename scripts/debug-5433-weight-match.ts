import { readSinYarnForPart } from '../server/sin-yarn.ts';

const FIXED = { 1: 0.02, 2: 0.01 };

function partBase(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim().toUpperCase();
}

function matches(
  part: { label: string; file_name: string },
  yarn: { label: string; file_name: string }
) {
  const pf = partBase(part.file_name);
  const yf = partBase(yarn.file_name);
  if (pf && yf && pf === yf) return true;
  if (part.label.toUpperCase() === yarn.label.toUpperCase()) return true;
  if (pf && yarn.label && pf.endsWith(`-${yarn.label.toUpperCase()}`)) return true;
  return false;
}

function weightForYarn(
  parts: { label: string; file_name: string; weight_kg: string }[],
  yarn: { label: string; file_name: string }
) {
  return parts
    .filter((p) => matches(p, yarn))
    .reduce((s, p) => s + Number(p.weight_kg.replace(',', '.') || 0), 0);
}

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const parts = [
  { label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv', weight_kg: '0,160' },
  { label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv', weight_kg: '0,160' },
  { label: 'BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv', weight_kg: '0,140' },
  { label: 'BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv', weight_kg: '0,140' },
];

const yarnParts = [
  { label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv' },
  { label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv' },
  { label: '5433-BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv' },
];

let total = 0;
for (const yp of yarnParts) {
  const w = weightForYarn(parts, yp);
  const sin = readSinYarnForPart(modelFolder, partBase(yp.file_name));
  let partTotal = 0;
  for (const g of sin.guides) {
    if (g.guide === 1 || g.guide === 2) continue;
    partTotal += w * ((g.pct ?? 0) / 100);
  }
  console.log(`${yp.label} weight=${w} yarn=${partTotal.toFixed(3)}`);
  total += partTotal;
}
total += FIXED[1] + FIXED[2];
console.log('TOTAL', total.toFixed(3), '(esperado ~0,547)');

// old label-only match for MG
const oldMgWeight = parts
  .filter((p) => p.label.toUpperCase() === '5433-BLUSA-TRANCAS-MG')
  .reduce((s, p) => s + Number(p.weight_kg.replace(',', '.')), 0);
console.log('old MG weight (label mismatch)', oldMgWeight);
