import { buildGuiaFioRows } from '../server/syntech-guia-fio.ts';
import { buildBicoMaquinaRows } from '../server/syntech-processos.ts';
import { pushCadastroToSyntech } from '../server/syntech-push.ts';
import { formatSyntechTempo } from '../server/syntech-db.ts';

const modelFolder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/TRICOT & CIA 2026/5433-BLUSA-TRANÇAS-AMALIA';

const parts = [
  {
    label: 'BLUSA-TRANCAS-CT',
    file_name: '5433-BLUSA-TRANCAS-CT.mdv',
    time_mmss: '07:58',
    weight_kg: '0,200',
  },
  {
    label: 'BLUSA-TRANCAS-FT',
    file_name: '5433-BLUSA-TRANCAS-FT.mdv',
    time_mmss: '07:58',
    weight_kg: '0,200',
  },
  {
    label: 'BLUSA-TRANCAS-MG',
    file_name: '5433-BLUSA-TRANCAS-MG.mdv',
    time_mmss: '12:00',
    weight_kg: '0,200',
  },
];

for (const part of parts) {
  const tempo = formatSyntechTempo(part.time_mmss);
  console.log(part.label, part.time_mmss, '->', tempo, `len=${tempo.length}`);
}

const consolidated_yarns = [
  { guide: 1, letter: 'A', description: 'SEPARACAO', consumption: '0,020', pct: 0, tipo_fio_codigo: 70 },
  { guide: 2, letter: 'B', description: 'ELASTICO PENTE', consumption: '0,010', pct: 0, tipo_fio_codigo: 13 },
  {
    guide: 3,
    letter: 'C',
    description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
    consumption: '0,248',
    pct: 44.44,
    tipo_fio_codigo: 60,
  },
  {
    guide: 6,
    letter: 'D',
    description: 'CAPRICE OFF 1 CABO LINHA SNOW 1 CABO',
    consumption: '0,024',
    pct: 4.3,
    tipo_fio_codigo: 60,
  },
  {
    guide: 7,
    letter: 'E',
    description: 'ELASTANO BRANCO 3 CABOS + LINHA SNOW 1 CABO',
    consumption: '0,013',
    pct: 2.33,
    tipo_fio_codigo: undefined,
  },
];

const guiaRows = buildGuiaFioRows(
  modelFolder,
  parts.map((p) => p.file_name)
);
console.log('\nGUIA_FIO rows:');
for (const row of guiaRows.filter((r) => r.direita || r.esquerda)) {
  console.log(row);
}

const bicos = buildBicoMaquinaRows(consolidated_yarns, guiaRows);
console.log('\nBicos máquina:');
for (const row of bicos) {
  console.log(row);
}

console.log('\nPush 5433…');
try {
  const result = await pushCadastroToSyntech({
    reference: '5433',
    parts,
    consolidated_yarns,
    model_folder: modelFolder,
  });
  console.log(JSON.stringify(result, null, 2));
} catch (err) {
  console.error('PUSH FAILED:', err instanceof Error ? err.message : err);
}
