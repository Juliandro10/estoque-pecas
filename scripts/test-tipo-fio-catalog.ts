import { resolveTipoFioCodigoFromCatalog } from '../server/syntech-yarn-types.ts';

const samples = [
  ['MODAL AREZZO PIMENTA 2 CABO', 47],
  ['MODAL AREZO SACHE PINK 2 CABO', 47],
  ['MODAL AREZZO', 47],
  ['MODAL MUNICH BEST FIOS', 31],
  ['RESTO DE FIO', 70],
  ['LASTEX', 13],
];

let failed = 0;
for (const [text, expected] of samples) {
  const codigo = resolveTipoFioCodigoFromCatalog(String(text));
  if (codigo !== expected) {
    console.error(`FAIL "${text}" -> ${codigo}, expected ${expected}`);
    failed++;
  } else {
    console.log(`OK "${text}" -> ${codigo}`);
  }
}

process.exit(failed === 0 ? 0 : 1);
