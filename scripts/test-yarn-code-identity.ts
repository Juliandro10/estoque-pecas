import {
  applyYarnCodigoToDescription,
  applyYarnColorToDescription,
  applyYarnColorToStoredDescription,
  resolveYarnRow,
  yarnRowsReadyForSyntech,
} from '../src/lib/syntech-yarn-match.ts';
import { replaceYarnGuideDescription } from '../shared/yarn-consumption.ts';
import type { ConsolidatedYarnRow, SyntechYarnCatalogFile } from '../src/types-programming.ts';

const catalog: SyntechYarnCatalogFile = {
  updated_at: '2026-09-14',
  source: 'test',
  types: [
    {
      codigo: 24,
      tipo: 'FIO LANTEJOULA',
      cores: ['DOURADO', 'PRETO', 'PRATA LANTEJOULA'],
    },
    {
      codigo: 4,
      tipo: 'POLISTER HB 2/28',
      cores: ['AREIA', 'BEGE MEDIO POLI', 'BRANCO'],
    },
  ],
};

let failed = 0;

function row(description: string, extra: Partial<ConsolidatedYarnRow> = {}): ConsolidatedYarnRow {
  return {
    guide: 3,
    letter: 'C',
    description,
    pct: 10,
    consumption: '0.01',
    parts: ['CT'],
    ...extra,
  };
}

function expect(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    console.error(`FAIL ${label}: got ${JSON.stringify(actual)} expected ${JSON.stringify(expected)}`);
    failed++;
  }
}

const byCode = resolveYarnRow(row('Codigo 24 - FIO LANTEJOLA 1 CABO DOURADOI'), catalog);
expect('codigo 24 identity', byCode.tipo_fio_codigo, 24);
expect('codigo 24 ok', byCode.codigo_ok, true);
expect('DOURADOI → DOURADO', byCode.cor, 'DOURADO');
expect('DOURADOI cor_ok', byCode.cor_ok, true);
expect('tipo catalog name', byCode.tipo_fio_nome, 'FIO LANTEJOULA');

const byName = resolveYarnRow(row('FIO LANTEJOLA 1 CABO DOURADO'), catalog);
expect('name LANTEJOLA → 24', byName.tipo_fio_codigo, 24);
expect('name LANTEJOLA codigo_ok', byName.codigo_ok, true);

const byRowCode = resolveYarnRow(
  row('LANTEJOLA 1 CABO CORINVENTADA', { tipo_fio_codigo: 24 }),
  catalog
);
expect('row codigo identity', byRowCode.tipo_fio_codigo, 24);
expect('row codigo ok even with unknown color', byRowCode.codigo_ok, true);
expect('unknown color stays', byRowCode.cor, 'CORINVENTADA');
expect('unknown color conferir', byRowCode.cor_ok, false);

const poli = resolveYarnRow(row('Codigo 4 - POLIESTER HB 2/28 1 CABO AREIA MEDIOI'), catalog);
expect('poli codigo 4', poli.tipo_fio_codigo, 4);
expect('poli codigo_ok', poli.codigo_ok, true);
expect('poli cor conferir', poli.cor_ok, false);
expect('poli keeps .sin color', poli.cor, 'AREIA MEDIOI');
expect('poli ready despite color', yarnRowsReadyForSyntech([poli]), true);

const stamped = applyYarnCodigoToDescription('FIO LANTEJOLA 1 CABO DOURADO', 24);
expect('stamp code', stamped, 'Codigo 24 - FIO LANTEJOLA 1 CABO DOURADO');
const stampedResolved = resolveYarnRow(row(stamped), catalog);
expect('stamped identity', stampedResolved.codigo_ok, true);
expect('stamped codigo', stampedResolved.tipo_fio_codigo, 24);

const colored = applyYarnColorToDescription(
  'Codigo 4 - POLIESTER HB 2/28 1 CABO AREIA MEDIOI',
  'BEGE MEDIO POLI',
  catalog
);
const coloredResolved = resolveYarnRow(row(colored), catalog);
expect('picked color ok', coloredResolved.cor_ok, true);
expect('picked color name', coloredResolved.cor, 'BEGE MEDIO POLI');
expect('picked color keeps code', coloredResolved.tipo_fio_codigo, 4);

const blend =
  'FIO LANTEJOLA 1 CABO DOURADO + POLIESTER HB 2/28 1 CABO AREIA MEDIOI';
const blendColored = applyYarnColorToStoredDescription(
  blend,
  1,
  'BEGE MEDIO POLI',
  catalog,
  4
);
if (!blendColored.startsWith('FIO LANTEJOLA 1 CABO DOURADO')) {
  console.error(`FAIL blend kept lantejoula: ${blendColored}`);
  failed++;
}
const blendSecond = blendColored.split(' + ')[1] ?? '';
const blendSecondResolved = resolveYarnRow(row(blendSecond), catalog);
expect('blend poli color ok', blendSecondResolved.cor_ok, true);
expect('blend poli color', blendSecondResolved.cor, 'BEGE MEDIO POLI');
expect('blend poli codigo', blendSecondResolved.tipo_fio_codigo, 4);

const replaced = replaceYarnGuideDescription(blend, blend, blendColored);
expect('replace stored blend', replaced, blendColored);

const lantejoulaBlack = applyYarnColorToStoredDescription(blend, 0, 'PRETO', catalog, 24);
const lantejoulaResolved = resolveYarnRow(row(lantejoulaBlack.split(' + ')[0] ?? ''), catalog);
expect('lantejoula PRETO ok', lantejoulaResolved.cor_ok, true);
expect('lantejoula PRETO', lantejoulaResolved.cor, 'PRETO');

console.log(failed === 0 ? 'OK' : `${failed} failure(s)`);
process.exit(failed === 0 ? 0 : 1);
