import { readFileSync } from 'node:fs';
import { parseYarnDescription } from '../shared/yarn-description-parse.ts';
import { findBestColorMatch, findBestYarnTypeMatch } from '../shared/syntech-name-match.ts';

const catalog = JSON.parse(readFileSync('data/syntech-fios.json', 'utf8'));
const yarnTypes = catalog.types.map((t: { tipo: string }) => t.tipo);
const modal = catalog.types.find((t: { codigo: number }) => t.codigo === 47);

const samples = [
  'MODAL AREZZO PIMENTA 2 CABO',
  'MODAL AREZO PIMENTA 2 CABO',
  'MODAL AREZZO PIMENTA DOCE 2 CABO',
  'MODAL AREZZO SACHE PINK 2 CABO',
];

console.log('MODAL AREZZO cores PIMENT*:', modal?.cores.filter((c: string) => /PIMENT/i.test(c)));

for (const description of samples) {
  const parsed = parseYarnDescription(description, yarnTypes);
  const tipo = findBestYarnTypeMatch(`${parsed.tipo}${parsed.cor ? ` ${parsed.cor}` : ''}`, yarnTypes) ?? parsed.tipo;
  const typeRow = catalog.types.find((t: { tipo: string }) => t.tipo === tipo);
  const corHit = parsed.cor ? findBestColorMatch(parsed.cor, typeRow?.cores ?? []) : null;
  const globalHit = parsed.cor ? findBestColorMatch(parsed.cor, yarnTypes.flatMap((_: string, i: number) => catalog.types[i].cores)) : null;
  console.log({ description, parsed, tipo, corHit, globalHit });
}
