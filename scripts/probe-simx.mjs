import fs from 'node:fs';

function hits(buf, v) {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(v);
  let c = 0;
  let i = 0;
  while ((i = buf.indexOf(n, i)) >= 0) {
    c++;
    i++;
  }
  return c;
}

function pickFromMdv(buf, simRows) {
  const targets = [simRows + 17, simRows - 172, simRows - 24, simRows + 40];
  const candidates = [];

  for (let o = 4; o < buf.length - 4; o += 4) {
    const sec = buf.readUInt32LE(o);
    if (sec < 120 || sec > 7200) continue;
    if (buf.readUInt32LE(o - 4) !== sec - 1) continue;
    if (buf.readUInt32LE(o + 4) !== sec + 1) continue;
    const h = hits(buf, sec);
    if (h < 3 || h > 4) continue;

    let trip = 0;
    for (let o2 = 4; o2 < buf.length - 4; o2 += 4) {
      if (buf.readUInt32LE(o2) !== sec) continue;
      if (buf.readUInt32LE(o2 - 4) === sec - 1 && buf.readUInt32LE(o2 + 4) === sec + 1) trip++;
    }
    if (trip < 2) continue;

    const ratio = o / buf.length;
    if (ratio < 0.04 || ratio > 0.28) continue;

    const targetDist = Math.min(...targets.map((t) => Math.abs(sec - t)));
    candidates.push({ sec, o, ratio, targetDist, trip });
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => a.targetDist - b.targetDist || b.trip - a.trip || a.o - b.o);
  return candidates[0]?.sec ?? null;
}

const tests = [
  ['CT', 671, '5469-POLO-LISTRADA-VITORIA-CT'],
  ['FT', 671, '5469-POLO-LISTRADA-VITORIA-FT'],
  ['MG', 564, '5469-POLO-LISTRADA-VITORIA-MG'],
  ['GOLA', 205, '5469-POLO-LISTRADA-VITORIA-GOLA'],
  ['5257', 727, '5257-CROPPED-BALONE-FT', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5257-CROPPED-BALONÊ/5257-CROPPED-BALONE-FT'],
];

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/';

for (const t of tests) {
  const p = t[0];
  const exp = t[1];
  const base = t[3] ?? `${folder}${t[2]}`;
  const mdv = fs.readFileSync(`${base}.mdv`);
  const simxPath = `${base}.simx`;
  let simRows = 0;
  if (fs.existsSync(simxPath)) {
    simRows = Number(fs.readFileSync(simxPath, 'utf8').match(/<simRows>(\d+)<\/simRows>/)?.[1] ?? 0);
  }
  const got = pickFromMdv(mdv, simRows);
  console.log(p, 'simRows', simRows, 'expect', exp, 'got', got, got === exp ? 'OK' : 'FAIL');
}
