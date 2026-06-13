import fs from 'node:fs';

import { parseYarnUsageFromSimx } from '../server/simx-yarn.ts';
import { readSinYarnForPart } from '../server/sin-yarn.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const partBases = ['5433-BLUSA-TRANCAS-CT', '5433-BLUSA-TRANCAS-FT', '5433-BLUSA-TRANCAS-MG'];

for (const base of partBases) {
  const sin = readSinYarnForPart(modelFolder, base);
  const pctSum = sin.guides.reduce((s, g) => s + (g.pct ?? 0), 0);
  const letters = sin.guides.map((g) => `${g.letter}=${g.pct ?? 0}%`).join(', ');
  console.log(`\n${base}`);
  console.log('  guides:', sin.guides.length, 'pctSum:', pctSum.toFixed(2), letters);

  const simxPath = `${modelFolder}/dados do programa/${base}/${base}.simx`;
  if (fs.existsSync(simxPath)) {
    const usage = parseYarnUsageFromSimx(fs.readFileSync(simxPath, 'utf8'));
    console.log('  simx letters:', usage.by_letter.map((r) => `${r.letter}=${r.pct.toFixed(1)}%`).join(', '));
    console.log('  simx total pct:', usage.by_letter.reduce((s, r) => s + r.pct, 0).toFixed(2));
  }
}

// simulate consumption with 0.16, 0.16, 0.28
const weights = { CT: 0.16, FT: 0.16, MG: 0.28 };
let total = 0.03;
for (const base of partBases) {
  const sin = readSinYarnForPart(modelFolder, base);
  const key = base.includes('-CT') ? 'CT' : base.includes('-FT') ? 'FT' : 'MG';
  const w = weights[key as keyof typeof weights];
  for (const g of sin.guides) {
    if (g.guide === 1 || g.guide === 2) continue;
    const c = w * ((g.pct ?? 0) / 100);
    total += c;
    console.log(`  ${key} guia ${g.guide} ${g.letter} ${g.pct}% -> ${c.toFixed(3)} kg`);
  }
}
console.log('\nTotal calculado (sem fixos):', (total - 0.03).toFixed(3), '+ fixos 0.03 =', total.toFixed(3));
