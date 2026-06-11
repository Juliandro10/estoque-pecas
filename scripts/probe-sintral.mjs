import fs from 'node:fs';
import CFB from 'cfb';

const ct = 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-CT.mdv';
const buf = fs.readFileSync(ct);
const cfb = CFB.read(buf, { type: 'buffer' });

for (const name of ['SINTRAL', 'SINTRAL_SIZE', 'Settings', 'Timelines']) {
  const entry = CFB.find(cfb, name);
  if (!entry?.content) {
    console.log(name, 'missing');
    continue;
  }
  const b = Buffer.from(entry.content);
  console.log(`\n=== ${name} size ${b.length} ===`);
  console.log('hex head:', b.subarray(0, 64).toString('hex'));
  console.log('latin:', b.toString('latin1').slice(0, 200).replace(/[^\x20-\x7E\n]/g, '.'));
  for (const v of [671, 670, 672, 727, 426]) {
    const n = Buffer.alloc(4);
    n.writeUInt32LE(v);
    const idx = b.indexOf(n);
    if (idx >= 0) console.log(`  contains ${v} @${idx}`);
  }
}
