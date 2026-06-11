import { pushCadastroToSyntech } from '../server/syntech-push.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/RICHARDS/2026/5534-REGATA-LISTRA';

const parts = [
  {
    label: 'CORPO',
    file_name: '5534-REGATA-LISTRA-CORPO.mdv',
    time_mmss: '24:56',
    weight_kg: '0,080',
  },
  {
    label: 'CORPO',
    file_name: '5534-REGATA-LISTRA-CORPO.mdv',
    time_mmss: '24:56',
    weight_kg: '0,080',
  },
  {
    label: 'GOLA',
    file_name: '5534-REGATA-LISTRA-GOLA.mdv',
    time_mmss: '03:05',
    weight_kg: '0,040',
  },
];

const consolidated_yarns = [
  { guide: 1, letter: 'A', description: 'SEPARACAO', consumption: '0,020', pct: 0 },
  { guide: 2, letter: 'B', description: 'ELASTICO PENTE', consumption: '0,010', pct: 0 },
  { guide: 3, letter: 'C', description: 'POWER BRIGHT 1 CABO NATURAL', consumption: '0,070', pct: 35 },
  { guide: 4, letter: 'D', description: 'POWER BRIGHT 1 CABO NATURAL', consumption: '0,030', pct: 15 },
  { guide: 5, letter: 'C', description: 'POWER BRIGHT 1 CABO GLORIOSA', consumption: '0,020', pct: 10 },
  { guide: 6, letter: 'E', description: 'POWER BRIGHT 1 CABO MANTEIGA', consumption: '0,060', pct: 30 },
  { guide: 8, letter: 'D', description: 'CODIGO 70 (RESTOS DE FIOS) 2 CABOS VARIADOSI', consumption: '0,020', pct: 10 },
];

console.log('Enviando 5534 ao Syntech…');

const result = await pushCadastroToSyntech({
  reference: '5534',
  parts,
  consolidated_yarns,
  model_folder: modelFolder,
});

console.log(JSON.stringify(result, null, 2));
