import fs from 'node:fs';

const base =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/dados do programa/5469-POLO-LISTRADA-VITORIA-CT';

const simx = fs.readFileSync(`${base}/5469-POLO-LISTRADA-VITORIA-CT.simx`, 'utf8');
const setx = fs.readFileSync(`${base}/5469-POLO-LISTRADA-VITORIA-CT.setx`, 'utf8');
const sin = fs.readFileSync(`${base}/5469-POLO-LISTRADA-VITORIA-CT.sin`, 'utf8');
const jac = fs.readFileSync(`${base}/5469-POLO-LISTRADA-VITORIA-CT.jac`);

console.log('=== SIMX ===');
console.log('size KB', Math.round(simx.length / 1024));
console.log('simRows', simx.match(/<simRows>(\d+)<\/simRows>/)?.[1]);
console.log('productivity block', /<productivity/i.test(simx));
console.log('knittingTime tag', /knittingTime/i.test(simx));
console.log('simStroke count', (simx.match(/<simStroke/g) || []).length);

console.log('\n=== SETX tempos parciais ===');
const msec0 = Number(setx.match(/<MSEC0\s+Value="([^"]+)"/)?.[1] ?? 0.95);
let strokeSec = 0;
for (const stroke of simx.matchAll(/<simStroke[\s\S]*?<\/simStroke>/g)) {
  const move = stroke[0].match(/movement sintral="([^"]+)"/)?.[1];
  if (!move) continue;
  const [a, b] = move.split('-').map((x) => Number(x.trim()));
  if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
  const msecTag = stroke[0].match(/\b(MSEC[^=\s"]*)=([0-9.]+)/)?.[1];
  const msec = Number(setx.match(new RegExp(`<${msecTag}\\s+Value="([^"]+)"`))?.[1] ?? msec0);
  strokeSec += Math.abs(b - a) / 1000 / msec;
}
let wmfSec = 0;
for (const m of setx.matchAll(/<WMF(\d+)\s+Value="([^"]+)"/g)) {
  const sec = Number(m[2].split(',')[1]);
  if (sec > 0) wmfSec += sec;
}
const total = Math.round(strokeSec + wmfSec);
console.log('estimativa strokes', Math.round(strokeSec), 's + WMF', wmfSec, 's =', total, `(${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')})`);
console.log('esperado CT', '11:11 = 671s');

console.log('\n=== SIN / JAC ===');
console.log('sin tem knitting/time?', /knitting|tempo|min\s*\d+\s*sec/i.test(sin));
console.log('jac size', jac.length, 'tem 671?', jac.indexOf(Buffer.from([671, 0, 0, 0])) >= 0);

for (const v of [671, 654, 403]) {
  const n = Buffer.alloc(4);
  n.writeUInt32LE(v);
  if (jac.indexOf(n) >= 0) console.log('jac LE32', v, 'found');
  if (sin.indexOf(n) >= 0) console.log('sin LE32', v, 'found');
}
