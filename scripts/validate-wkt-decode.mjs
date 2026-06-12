import fs from 'node:fs';
import { decodePackedWkt } from './probe-wkt-decode.mjs';

const simx = fs.readFileSync(
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/GARAGE/5500-REGATA-DANI/5500-REGATA-DANI-CORPO.simx',
  'utf8'
);

const plain = new Map();
for (const m of simx.matchAll(/simLine id="(\d+)"[\s\S]*?wktData packedMode="0" size="(\d+)">([^<]+)/g)) {
  plain.set(m[1], { size: Number(m[2]), data: m[3] });
}

console.log('plain lines', [...plain.keys()]);

for (const m of simx.matchAll(/simLine id="(\d+)"[\s\S]*?wktData packedMode="2" size="(\d+)">([^<]+)/g)) {
  const id = m[1];
  const size = Number(m[2]);
  const decoded = decodePackedWkt(m[3], size);
  for (const [pid, row] of plain) {
    if (row.size === size && row.data === decoded) {
      console.log('MATCH line', id, '== plain', pid);
    }
  }
}

for (const [pid, row] of plain) {
  console.log('\nplain', pid, 'head', JSON.stringify(row.data.slice(0, 90)));
}

const sample104 = decodePackedWkt('AACAVi4ARYBpQVlBSFlBWUEAgFUu', 699);
console.log('\n104 decoded head', JSON.stringify(sample104.slice(60, 120)));
