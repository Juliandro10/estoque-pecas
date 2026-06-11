import fs from 'node:fs';

function estimateFromSimxSetx(simxPath, setxPath) {
  const simx = fs.readFileSync(simxPath, 'utf8');
  const setx = fs.readFileSync(setxPath, 'utf8');
  const msecBySystem = new Map();
  for (const m of setx.matchAll(/<MSEC(\w+)\s+Value="([^"]+)"/g)) {
    msecBySystem.set(`MSEC${m[1]}`, Number(m[2]));
  }
  const defaultMsec = msecBySystem.get('MSEC0') ?? 0.95;

  let strokeSec = 0;
  let strokeCount = 0;
  for (const stroke of simx.matchAll(/<simStroke[\s\S]*?<\/simStroke>/g)) {
    strokeCount++;
    const block = stroke[0];
    const move = block.match(/movement sintral="([^"]+)"/)?.[1];
    if (!move) continue;
    const [a, b] = move.split('-').map((x) => Number(x.trim()));
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    const msecTag = block.match(/\b(MSEC[^=\s"]*)=([0-9.]+)/)?.[1];
    const msec = (msecTag && msecBySystem.get(msecTag)) || defaultMsec;
    strokeSec += Math.abs(b - a) / 1000 / msec;
  }

  let wmfSec = 0;
  for (const w of setx.matchAll(/<WMF(\d+)\s+Value="([^"]+)"/g)) {
    const sec = Number(w[2].split(',')[1]);
    if (sec > 0) wmfSec += sec;
  }

  const total = strokeSec + wmfSec;
  const m = Math.floor(total / 60);
  const s = Math.round(total % 60);
  return { strokeCount, strokeSec: Math.round(strokeSec), wmfSec, total: Math.round(total), mmss: `${m}:${String(s).padStart(2, '0')}` };
}

const base =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';
const expect = { CT: 671, FT: 671, MG: 564, GOLA: 205 };

for (const p of ['CT', 'FT', 'MG', 'GOLA']) {
  const r = estimateFromSimxSetx(
    `${base}/5469-POLO-LISTRADA-VITORIA-${p}.simx`,
    `${base}/5469-POLO-LISTRADA-VITORIA-${p}.setx`
  );
  console.log(p, 'expect', expect[p], r);
}

const ref5257 =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5257-CROPPED-BALONÊ/5257-CROPPED-BALONE-FT';
const r5257 = estimateFromSimxSetx(`${ref5257}.simx`, `${ref5257}.setx`);
console.log('5257 expect 727', r5257);
