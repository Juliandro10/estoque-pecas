import { readM1TimesForModel } from '../server/stoll-time.ts';

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';
const parts = ['CT', 'FT', 'MG', 'GOLA'].map((label) => ({
  label,
  file_name: `5469-POLO-LISTRADA-VITORIA-${label}.mdv`,
}));

const t0 = Date.now();
const results = readM1TimesForModel('C:/Stoll/Tmp', folder, parts);
for (const part of results) {
  console.log(part.label, part.ok ? part.time_mmss : part.error, part.source ?? '');
}
console.log('filled', results.filter((p) => p.ok).length, '/', results.length, 'ms', Date.now() - t0);
