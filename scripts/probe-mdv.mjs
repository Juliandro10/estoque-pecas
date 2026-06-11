import fs from 'node:fs';

function utf16At(buf, off) {
  let s = '';
  for (let i = off; i + 1 < buf.length && s.length < 48; i += 2) {
    const c = buf.readUInt16LE(i);
    if (c === 0) continue;
    if (c >= 32 && c < 127) s += String.fromCharCode(c);
    else {
      if (s.length >= 4) return s;
      s = '';
    }
  }
  return s.length >= 4 ? s : null;
}

function scoreCandidate(c, secCounts) {
  let score = 0;
  const { sec, label, offset } = c;
  if (label.startsWith('class M3_MDV_MarkColumns2')) score += 1000;
  else if (label.startsWith('class M3_MDV_MarkColumns')) score += 900;
  else if (label.startsWith('class M3_MDV_')) score += 700;
  else if (/^@?DB_Entry_/.test(label)) score += 500;
  else if (label.endsWith(' Layer')) score += 300;
  else if (label === 'CountLayers') score += 100;

  if (secCounts.get(sec) === 1) score += 200;
  if (sec >= 300 && sec <= 1200) score += 50;
  score -= offset / 1_000_000;
  return score;
}

export function readKnittingTimeFromMdvBuffer(buf) {
  const candidates = [];

  for (let offset = 4096; offset <= buf.length - 48; offset += 4) {
    const sec = buf.readUInt32LE(offset);
    if (sec < 120 || sec > 7200) continue;

    const next = buf.readUInt32LE(offset + 4);
    const label = utf16At(buf, offset + 8);
    if (!label) continue;

    const seqNext = next === sec + 1;
    const classOrDb = /^class M3_MDV_/.test(label) || /^@?DB_Entry_/.test(label);
    const layerLabel = label.endsWith(' Layer');

    if (seqNext && (classOrDb || layerLabel)) {
      candidates.push({ sec, offset, label, kind: 'seq' });
      continue;
    }

    if (label === 'CountLayers' && next > 0 && next < 500 && sec <= 400) {
      candidates.push({ sec, offset, label, kind: 'layers' });
    }
  }

  if (candidates.length === 0) return null;

  const secCounts = new Map();
  for (const c of candidates) {
    secCounts.set(c.sec, (secCounts.get(c.sec) ?? 0) + 1);
  }

  let best = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    const score = scoreCandidate(c, secCounts);
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }

  return best;
}

const tests = [
  ['5469-CT', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-CT.mdv', 671],
  ['5469-FT', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-FT.mdv', 671],
  ['5469-MG', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-MG.mdv', 564],
  ['5469-GOLA', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA/5469-POLO-LISTRADA-VITORIA-GOLA.mdv', 205],
  ['5257-FT', 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5257-CROPPED-BALONÊ/5257-CROPPED-BALONE-FT.mdv', 727],
];

for (const [name, filePath, expect] of tests) {
  const buf = fs.readFileSync(filePath);
  const best = readKnittingTimeFromMdvBuffer(buf);
  const ok = best?.sec === expect;
  const mm = best ? `${Math.floor(best.sec / 60)}:${String(best.sec % 60).padStart(2, '0')}` : '?';
  console.log(name, ok ? 'OK' : 'FAIL', 'expect', expect, 'got', best?.sec, mm, best?.label);
}
