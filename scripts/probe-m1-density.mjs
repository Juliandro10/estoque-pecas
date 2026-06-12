import fs from 'node:fs';

function knittingWidthFromSin(sin) {
  const lr = [];
  for (const m of sin.matchAll(/#L=(\d+)[^\n]*#R=(\d+)/g)) {
    const l = Number(m[1]);
    const r = Number(m[2]);
    lr.push({ l, r, w: r - l + 1 });
  }
  const machineBed = lr.filter((x) => x.l === 1).map((x) => x.w);
  const bed = machineBed.length ? Math.max(...machineBed) : null;
  const filtered = lr.filter((x) => x.w > 1 && (bed == null || x.w < bed));
  const freq = new Map();
  for (const x of filtered) freq.set(x.w, (freq.get(x.w) ?? 0) + 1);
  const top = [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];
  if (!top) return { w: null, bed };
  const modeW = top[0];
  const modeRows = filtered.filter((x) => x.w === modeW);
  return { w: modeW, bed, left: modeRows[0]?.l, right: modeRows[0]?.r };
}

function productionLettersFromSin(sin) {
  const letters = new Set();
  for (const m of sin.matchAll(/(?:^|\s)([3-9]|1\d)=([A-Z])\b/gm)) {
    letters.add(m[2]);
  }
  for (const line of sin.split(/\r?\n/)) {
    const m = line.match(/^\s*\d+\s+C\s+.*I\s+([3-9]|1\d)=([A-Z])/);
    if (m) letters.add(m[2]);
  }
  return letters;
}

function analyze(simxPath, sinPath) {
  const simx = fs.readFileSync(simxPath, 'utf8');
  const sin = fs.existsSync(sinPath) ? fs.readFileSync(sinPath, 'utf8') : '';
  const { w: knitW } = knittingWidthFromSin(sin);
  const prodYarns = productionLettersFromSin(sin);

  const strokeRe = /<simStroke id="(\d+)">([\s\S]*?)<\/simStroke>/g;
  const lineMeta = new Map();
  for (const m of simx.matchAll(strokeRe)) {
    const block = m[2];
    const l = Number(block.match(/<counter id="#L">(\d+)<\/counter>/)?.[1] ?? 0);
    const r = Number(block.match(/<counter id="#R">(\d+)<\/counter>/)?.[1] ?? 0);
    const w = r - l + 1;
    for (const lm of block.matchAll(/<simLine id="(\d+)">([\s\S]*?)<\/simLine>/g)) {
      const id = Number(lm[1]);
      const lb = lm[2];
      lineMeta.set(id, {
        w,
        yarn: lb.match(/yarnType="([^"]+)"/)?.[1] ?? '',
        rd: lb.match(/<repeatDef>([^<]+)<\/repeatDef>/)?.[1] ?? '',
      });
    }
  }

  const prod = [...lineMeta.entries()].filter(
    ([, m]) => m.w === knitW && (prodYarns.size === 0 ? m.yarn !== 'A' && m.yarn !== 'B' : prodYarns.has(m.yarn))
  );
  const rsPre = new Map();
  for (const m of simx.matchAll(/<counter id="(RS\d+)">(\d+)<\/counter>/g)) {
    const id = m[1];
    const v = Number(m[2]);
    rsPre.set(id, Math.max(rsPre.get(id) ?? 0, v));
  }

  console.log('\n===', simxPath.split(/[/\\]/).pop(), 'knitW', knitW, 'yarns', [...prodYarns], '===');
  for (const [rs, pre] of [...rsPre.entries()].filter(([, p]) => p > 1).sort((a, b) => b[1] - a[1])) {
    const ids = [...new Set(prod.filter(([, m]) => m.rd.includes(rs)).map(([id]) => id))];
    const passes = pre > 0 && ids.length > 0 ? ids.length / pre : 0;
    console.log(rs, 'pre', pre, 'uniqueIds', ids.length, 'passes/cycle', passes);
  }
  const allProdIds = new Set(prod.map(([id]) => id));
  console.log('all prod unique ids', allProdIds.size);
}

analyze(process.argv[2], process.argv[3]);
if (process.argv[4]) analyze(process.argv[4], process.argv[5]);
