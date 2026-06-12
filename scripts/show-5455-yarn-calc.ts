import { readSinYarnForPart } from '../server/sin-yarn.ts';

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/LEZ A LEZ/5455-TOP-CROCHE-LEIA';

const partWeights: Record<string, number> = {
  '5455-TOP-CROCHE-LEIA-CT-P-4': 0.06,
  '5455-TOP-CROCHE-LEIA-FT-P-4': 0.06,
};

function fmtKg(v: number) {
  return `${v.toFixed(3).replace('.', ',')} kg`;
}

function fmtPct(v: number) {
  return `${v.toFixed(2).replace('.', ',')}%`;
}

const fixed: Record<number, number> = { 1: 0.02, 2: 0.01 };
const consolidated = new Map<number, { desc: string; letter: string; sum: number; lines: string[] }>();

console.log('5455 TOP-CROCHE-LEIA — cálculo por guia-fio\n');

for (const [partBase, weight] of Object.entries(partWeights)) {
  const label = partBase.replace('5455-TOP-CROCHE-LEIA-', '');
  const row = readSinYarnForPart(folder, partBase);
  console.log(`=== ${label} · peso parte ${fmtKg(weight)} ===`);
  if (!row.ok) {
    console.log('Erro:', row.error);
    continue;
  }
  console.log(`sin: ${row.sin_file} · simx: ${row.simx_file ?? '—'} · simx_ok: ${row.simx_ok}`);
  console.log('');

  for (const guide of [...row.guides].sort((a, b) => a.guide - b.guide)) {
    const pct = guide.pct ?? 0;
    let consumo: number;
    let formula: string;

    if (fixed[guide.guide] !== undefined) {
      consumo = fixed[guide.guide];
      formula = `fixo bico ${guide.guide}`;
    } else {
      consumo = weight * (pct / 100);
      formula = `${weight.toFixed(3)} × ${pct.toFixed(2)}%`;
    }

    console.log(
      `  Bico ${guide.guide} (${guide.letter}) ${guide.description}\n` +
        `    simx: ${pct ? fmtPct(pct) : '—'} · ${formula} = ${fmtKg(consumo)}`
    );

    const prev = consolidated.get(guide.guide);
    const line = `${label}: ${fmtKg(consumo)} (${pct ? fmtPct(pct) : 'fixo'})`;
    if (prev) {
      prev.sum += consumo;
      prev.lines.push(line);
    } else {
      consolidated.set(guide.guide, {
        desc: guide.description,
        letter: guide.letter,
        sum: consumo,
        lines: [line],
      });
    }
  }
  console.log('');
}

const totalPartWeight = Object.values(partWeights).reduce((a, b) => a + b, 0);
console.log('=== CONSOLIDADO (soma das partes) ===\n');
let totalCalc = 0;
for (const [bico, row] of [...consolidated.entries()].sort((a, b) => a[0] - b[0])) {
  const isFixed = fixed[bico] !== undefined;
  const pctTotal = isFixed ? 0 : (row.sum / totalPartWeight) * 100;
  if (!isFixed) totalCalc += row.sum;
  console.log(`Bico ${bico} (${row.letter}) ${row.desc}`);
  for (const line of row.lines) console.log(`  ${line}`);
  console.log(`  → total: ${fmtKg(row.sum)}${isFixed ? ' · fora do %' : ` · ${fmtPct(pctTotal)} do peso partes`}`);
  console.log('');
}

console.log(`Peso partes: ${fmtKg(totalPartWeight)}`);
console.log(`Soma fios calculados (sem bicos 1–2): ${fmtKg(totalCalc)}`);
console.log(`+ sep./pente fixos: ${fmtKg((fixed[1] ?? 0) + (fixed[2] ?? 0))}`);
console.log(`Total geral: ${fmtKg(totalCalc + (fixed[1] ?? 0) + (fixed[2] ?? 0))}`);
