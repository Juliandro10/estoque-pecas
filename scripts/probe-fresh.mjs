import fs from 'node:fs';

function countHits(buf, sec) {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(sec);
  let c = 0;
  let i = 0;
  while ((i = buf.indexOf(n, i)) >= 0) {
    c++;
    i++;
  }
  return c;
}

function tripletOffsets(buf) {
  const bySec = new Map();
  for (let o = 4; o < buf.length - 4; o += 4) {
    const sec = buf.readUInt32LE(o);
    if (sec < 120 || sec > 7200) continue;
    if (buf.readUInt32LE(o - 4) !== sec - 1) continue;
    if (buf.readUInt32LE(o + 4) !== sec + 1) continue;
    if (!bySec.has(sec)) bySec.set(sec, []);
    bySec.get(sec).push(o);
  }
  return [...bySec.entries()]
    .map(([sec, offs]) => ({
      sec,
      hits: countHits(buf, sec),
      trip: offs.length,
      minOff: Math.min(...offs),
    }))
    .filter((c) => c.hits >= 3 && c.hits <= 4 && c.trip >= 1)
    .sort((a, b) => b.minOff - a.minOff);
}

const base =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';

for (const p of ['CT', 'MG', 'GOLA']) {
  const buf = fs.readFileSync(`${base}/5469-POLO-LISTRADA-VITORIA-${p}.mdv`);
  const mdvMs = fs.statSync(`${base}/5469-POLO-LISTRADA-VITORIA-${p}.mdv`).mtimeMs;
  const simxMs = fs.statSync(`${base}/5469-POLO-LISTRADA-VITORIA-${p}.simx`).mtimeMs;
  const top = tripletOffsets(buf).filter((c) => c.minOff >= 100000 && c.sec >= 200 && c.sec <= 1200);
  console.log(`\n${p} mdv=${new Date(mdvMs).toISOString()} simx=${new Date(simxMs).toISOString()}`);
  console.log('high offset candidates:', top.slice(0, 12));
}
