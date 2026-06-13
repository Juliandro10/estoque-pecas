import {
  applyAutoYarnConsumption,
  consolidateYarnParts,
  programPartsOnly,
  totalCalculatedYarnConsumption,
  totalPartsWeight,
  totalYarnConsumption,
} from '../src/lib/cadastro-db.ts';
import { expandConsolidatedForProcessos } from '../src/lib/yarn-blend.ts';
import { readSyntechYarnCatalog } from '../server/syntech-yarn-catalog.ts';
import { readSinYarnsForModel } from '../server/sin-yarn.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const parts4 = [
  { key: '1', label: 'BLUSA-TRANCAS-CT', file_name: '5433-BLUSA-TRANCAS-CT.mdv', time_mmss: '07:58', weight_kg: '0,160' },
  { key: '2', label: 'BLUSA-TRANCAS-FT', file_name: '5433-BLUSA-TRANCAS-FT.mdv', time_mmss: '07:58', weight_kg: '0,160' },
  { key: '3', label: 'BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv', time_mmss: '05:42', weight_kg: '0,140' },
  { key: '4', label: 'BLUSA-TRANCAS-MG', file_name: '5433-BLUSA-TRANCAS-MG.mdv', time_mmss: '05:42', weight_kg: '0,140' },
];

const parts3 = parts4.slice(0, 3).map((p, i) => ({
  ...p,
  weight_kg: i < 2 ? '0,200' : '0,200',
}));

function run(label: string, parts: typeof parts4) {
  const programParts = programPartsOnly(parts);
  const sinParts = readSinYarnsForModel(modelFolder, programParts);
  const yarnParts = sinParts.map((p) => ({
    key: p.label.toUpperCase(),
    label: p.label,
    file_name: p.file_name,
    guides: p.guides.map((g) => ({ ...g, consumption: '' })),
  }));

  const computed = applyAutoYarnConsumption(yarnParts, parts);
  const consolidated = consolidateYarnParts(computed, parts);
  const catalog = readSyntechYarnCatalog();
  const expanded = expandConsolidatedForProcessos(consolidated, catalog);

  console.log(`\n=== ${label} ===`);
  console.log('parts', programParts.length, 'peso', totalPartsWeight(parts));
  console.log('yarn parts', yarnParts.length);
  for (const yp of computed) {
    const pctSum = yp.guides.reduce((s, g) => s + (g.pct ?? 0), 0);
    const consSum = yp.guides.reduce((s, g) => s + Number(g.consumption.replace(',', '.') || 0), 0);
    console.log(`  ${yp.label}: pctSum=${pctSum.toFixed(1)}% consSum=${consSum.toFixed(3)} weightUsed=${parts.filter((p) => p.label === yp.label).reduce((s, p) => s + Number(p.weight_kg.replace(',', '.')), 0)}`);
  }
  console.log('consolidated total', totalYarnConsumption(consolidated));
  console.log('calculated total', totalCalculatedYarnConsumption(consolidated));
  console.log('expanded slots', expanded.length, 'sum', expanded.reduce((s, r) => s + Number(r.consumption.replace(',', '.') || 0), 0));
  for (const row of expanded) {
    console.log(`  slot ${row.syntech_slot} guia ${row.guide} ${row.consumption} (${row.pct.toFixed(2)}%)`);
  }
}

run('4 partes (0.16+0.16+0.14+0.14)', parts4);
run('3 partes (0.2 each)', parts3);

// simx pct sum per part
for (const p of readSinYarnsForModel(modelFolder, programPartsOnly(parts4))) {
  const pctSum = p.guides.reduce((s, g) => s + (g.pct ?? 0), 0);
  console.log(`simx ${p.label}: guides=${p.guides.length} pctSum=${pctSum.toFixed(2)}%`);
}
