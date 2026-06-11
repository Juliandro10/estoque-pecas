import { readSinYarnForPart } from '../server/sin-yarn.ts';

const CONSUMPTION_SCALE = 1000;

function parseConsumptionInput(raw: string) {
  const text = raw.trim().replace(',', '.');
  if (!text) return 0;
  const value = Number(text);
  return Number.isFinite(value) ? value : 0;
}

function ceilConsumption(value: number) {
  if (!value || value <= 0) return 0;
  return Math.ceil(value * CONSUMPTION_SCALE - 1e-12) / CONSUMPTION_SCALE;
}

function formatConsumption(value: number) {
  const rounded = ceilConsumption(value);
  if (!rounded) return '';
  return rounded.toFixed(3).replace('.', ',');
}

function totalWeightForLabel(parts: { label: string; weight_kg: string }[], label: string) {
  return parts
    .filter((part) => part.label.toUpperCase() === label.toUpperCase())
    .reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
}

function applyAutoYarnConsumption(
  yarnParts: { label: string; guides: { guide: number; letter: string; description?: string; pct?: number; consumption?: string }[] }[],
  parts: { label: string; weight_kg: string }[]
) {
  return yarnParts.map((yarnPart) => {
    const weight = totalWeightForLabel(parts, yarnPart.label);
    return {
      ...yarnPart,
      guides: yarnPart.guides.map((guide) => {
        const pct = guide.pct ?? 0;
        const consumption = weight > 0 && pct > 0 ? formatConsumption(weight * (pct / 100)) : '';
        return { ...guide, consumption };
      }),
    };
  });
}

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/RICHARDS/2026/5534-REGATA-LISTRA';
const parts = [
  { label: 'CORPO', file_name: '5534-REGATA-LISTRA-CORPO.mdv', weight_kg: '0,080' },
  { label: 'CORPO', file_name: '5534-REGATA-LISTRA-CORPO.mdv', weight_kg: '0,080' },
  { label: 'GOLA', file_name: '5534-REGATA-LISTRA-GOLA.mdv', weight_kg: '0,040' },
];

const corpo = readSinYarnForPart(folder, '5534-REGATA-LISTRA-CORPO');
const gola = readSinYarnForPart(folder, '5534-REGATA-LISTRA-GOLA');

const yarnParts = [
  { key: 'CORPO', label: 'CORPO', file_name: '5534-REGATA-LISTRA-CORPO.mdv', guides: corpo.guides },
  { key: 'GOLA', label: 'GOLA', file_name: '5534-REGATA-LISTRA-GOLA.mdv', guides: gola.guides },
];

console.log('=== CORPO simx % ===');
for (const g of corpo.guides) {
  console.log(`Bico ${g.guide} ${g.letter} ${(g.pct ?? 0).toFixed(2)}% ${g.description ?? ''}`);
}

console.log('\n=== GOLA simx % ===');
for (const g of gola.guides) {
  console.log(`Bico ${g.guide} ${g.letter} ${(g.pct ?? 0).toFixed(2)}% ${g.description ?? ''}`);
}

const computed = applyAutoYarnConsumption(yarnParts, parts);

console.log('\n=== Consumo por parte ===');
for (const yp of computed) {
  console.log(`\n${yp.label}:`);
  for (const g of yp.guides) {
    console.log(`  Bico ${g.guide} ${g.letter} simx ${g.pct}% → ${g.consumption} kg`);
  }
}

const corpoGuides = computed.find((p) => p.label === 'CORPO')!.guides;
const golaGuides = computed.find((p) => p.label === 'GOLA')!.guides;
const corpoWeight = 0.16;
const golaWeight = 0.04;

function sumKg(guides: typeof corpoGuides) {
  return guides.reduce((s, g) => s + parseConsumptionInput(g.consumption ?? ''), 0);
}

const natural = corpoGuides.filter((g) => g.guide === 3 || g.guide === 4);
const manteiga = corpoGuides.filter((g) => g.guide === 6);
const remonteCorpo = corpoGuides.filter((g) => g.guide === 8);
const discardCorpo = corpoGuides.filter((g) => g.guide === 1 || g.guide === 2);

const naturalKg = sumKg(natural);
const manteigaKg = sumKg(manteiga);
const remonteCorpoKg = sumKg(remonteCorpo);
const discardKg = sumKg(discardCorpo);
const corpoRealKg = naturalKg + manteigaKg + remonteCorpoKg;

console.log('\n=== CORPO — auto vs seu olho (0,160 kg) ===');
console.log(`Natural (3+4): ${naturalKg.toFixed(3)} kg = ${((naturalKg / corpoWeight) * 100).toFixed(1)}% do corpo | você: 55–60%`);
console.log(`Manteiga (6):  ${manteigaKg.toFixed(3)} kg = ${((manteigaKg / corpoWeight) * 100).toFixed(1)}% do corpo | você: 40–45%`);
console.log(`Remonte (8):     ${remonteCorpoKg.toFixed(3)} kg = ${((remonteCorpoKg / corpoWeight) * 100).toFixed(1)}% do corpo`);
console.log(`Descarte (1+2):  ${discardKg.toFixed(3)} kg`);
console.log(
  `Excluindo descarte: Natural ${((naturalKg / corpoRealKg) * 100).toFixed(1)}% | Manteiga ${((manteigaKg / corpoRealKg) * 100).toFixed(1)}% | Remonte ${((remonteCorpoKg / corpoRealKg) * 100).toFixed(1)}%`
);

const gloriosa = golaGuides.filter((g) => g.guide === 5);
const remonteGola = golaGuides.filter((g) => g.guide === 8);
const discardGola = golaGuides.filter((g) => g.guide === 1 || g.guide === 2);

const gloriosaKg = sumKg(gloriosa);
const remonteGolaKg = sumKg(remonteGola);
const golaRealKg = gloriosaKg + remonteGolaKg;

console.log('\n=== GOLA — auto vs seu olho (0,040 kg) ===');
console.log(`Gloriosa (5): ${gloriosaKg.toFixed(3)} kg = ${((gloriosaKg / golaWeight) * 100).toFixed(1)}% | você: ~50%`);
console.log(`Remonte (8):  ${remonteGolaKg.toFixed(3)} kg = ${((remonteGolaKg / golaWeight) * 100).toFixed(1)}% | você: ~50%`);
console.log(`Descarte:     ${sumKg(discardGola).toFixed(3)} kg`);
console.log(
  `Excluindo descarte: Gloriosa ${((gloriosaKg / golaRealKg) * 100).toFixed(1)}% | Remonte ${((remonteGolaKg / golaRealKg) * 100).toFixed(1)}%`
);

const totalConsumption =
  sumKg(corpoGuides) + sumKg(golaGuides);
console.log(`\nPeso peça: 0,200 kg | Soma consumo (todos bicos): ${totalConsumption.toFixed(3)} kg`);
