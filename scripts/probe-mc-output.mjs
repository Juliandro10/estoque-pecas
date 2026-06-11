import fs from 'node:fs';
import CFB from 'cfb';

const base =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';

for (const p of ['CT', 'MG', 'GOLA']) {
  const mdvPath = `${base}/5469-POLO-LISTRADA-VITORIA-${p}.mdv`;
  const mdvMs = fs.statSync(mdvPath).mtime;
  const simxMs = fs.statSync(`${base}/5469-POLO-LISTRADA-VITORIA-${p}.simx`).mtime;
  const cfb = CFB.read(fs.readFileSync(mdvPath), { type: 'buffer' });

  console.log(`\n=== ${p} mdv=${mdvMs.toISOString()} simx=${simxMs.toISOString()} ===`);

  for (const entry of cfb.FileIndex) {
    if (!entry?.name || entry.name.startsWith('Root')) continue;
    const data = CFB.find(cfb, entry.name)?.content;
    if (!data || data.length === 0) continue;

    const buf = Buffer.from(data);
    const utf8 = buf.toString('utf8');
    const utf16 = buf.toString('utf16le');

    const patterns = [
      /knittingTimeSeconds[^<\s]{0,30}/i,
      /knittingTime[^<\s]{0,30}/i,
      /Tempo de tricotagem/i,
      /productivity/i,
    ];

    for (const pattern of patterns) {
      const m8 = utf8.match(pattern);
      const m16 = utf16.match(pattern);
      if (m8 || m16) {
        console.log(' ', entry.name, 'size', buf.length, 'match', m8?.[0] ?? m16?.[0]);
      }
    }

    if (/Output|Product|Check|Simul|Time|Mc-/i.test(entry.name)) {
      const preview = utf8.replace(/\0/g, ' ').slice(0, 200);
      if (preview.trim()) console.log(' ', entry.name, 'preview', preview);
    }
  }
}
