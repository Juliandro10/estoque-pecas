import { readSinYarnsForModel } from '../server/sin-yarn.ts';
import { listModelParts } from '../server/model-parts.ts';

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5472-CARDIGAN-CASULO-CANELADO';
const parts = listModelParts(folder, '5472-CARDIGAN-CASULO-CANELADO', '5472');
const sin = readSinYarnsForModel(folder, parts);
for (const p of sin) {
  console.log(p.label, p.file_name, p.ok ? 'ok' : p.error);
  for (const g of p.guides) {
    console.log(`  guia ${g.guide} ${g.letter} ${g.pct}% ${(g.description ?? '').slice(0, 50)}`);
  }
}
