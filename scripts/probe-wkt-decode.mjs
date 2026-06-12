import fs from 'node:fs';

const simx = fs.readFileSync(
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/GARAGE/5500-REGATA-DANI/5500-REGATA-DANI-CORPO.simx',
  'utf8'
);

function grabWkt(simLineId) {
  const re = new RegExp(
    `simLine id="${simLineId}"[\\s\\S]*?<wktData packedMode="(0|2)"[^>]*size="(\\d+)"[^>]*>([^<]+)`
  );
  const m = simx.match(re);
  if (!m) return null;
  return { mode: m[1], size: Number(m[2]), payload: m[3].trim() };
}

export function decodePackedWkt(b64, size) {
  const buf = Buffer.from(String(b64 ?? '').replace(/\s/g, ''), 'base64');
  if (!buf.length) return '.'.repeat(size);

  if (buf.length <= 6) {
    return String.fromCharCode(buf[buf.length - 1]).repeat(size);
  }

  const out = [];
  let i = 4;

  while (i < buf.length && out.length < size) {
    if (i + 3 < buf.length && buf[i + 3] === 0x80) {
      const ch = buf[i];
      const count = buf[i + 2];
      i += 4;
      for (let k = 0; k < count; k++) out.push(ch);
      continue;
    }
    out.push(buf[i]);
    i += 1;
  }

  while (out.length < size) out.push(0x2e);
  return String.fromCharCode(...out.slice(0, size));
}

function analyzePeriod(s) {
  let i = 0;
  while (s[i] === '.') i++;
  const rest = s.slice(i);
  for (const n of [4, 5, 6, 7, 8, 9, 10]) {
    const unit = rest.slice(0, n);
    let ok = true;
    for (let p = 0; p + n <= rest.length; p += n) {
      if (rest.slice(p, p + n) !== unit) {
        ok = false;
        break;
      }
    }
    if (ok) console.log('  period', n, 'unit', JSON.stringify(unit));
  }
  console.log('  rest len', rest.length, 'sample', JSON.stringify(rest.slice(0, 40)));
}

const hh =
  'AACAWi5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgABy5IAAcuSAAHLkgAgFgu';
console.log('\n=== HH packed ===');
const hhDec = decodePackedWkt(hh, 699);
console.log('uniq', [...new Set(hhDec)].join(''), 'mid', JSON.stringify(hhDec.slice(80, 160)));

for (const id of ['6', '104']) {
  const row = grabWkt(id);
  console.log('\n=== simLine', id, '===');
  if (!row) {
    console.log('not found');
    continue;
  }
  console.log('mode', row.mode, 'size', row.size);
  if (row.mode === '0') {
    let dots = 0;
    while (row.payload[dots] === '.') dots++;
    console.log('leading dots', dots);
    console.log('head', JSON.stringify(row.payload.slice(0, 100)));
    analyzePeriod(row.payload);
  } else {
    const a = decodePackedWkt(row.payload, row.size);
    console.log('b64', row.payload);
    console.log('decode uniq', [...new Set(a)].join(''), 'head', JSON.stringify(a.slice(0, 80)));
    analyzePeriod(a);
  }
}
