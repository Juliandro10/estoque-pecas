import fs from 'node:fs';

const sample =
  process.argv[2] ??
  'C:\\Users\\Tricot&Cia\\Desktop\\PROGRAMAS\\PROGRAMAS-POR-CLIENTE\\ANIMALE\\5469-POLO-LISTRADA-VITORIA\\dados do programa\\5469-POLO-LISTRADA-VITORIA-CT\\5469-POLO-LISTRADA-VITORIA-CT.sin';

function parseTableLine(line: string) {
  const prefix = line.match(/^\s*\d+\s+C\s+/i);
  if (!prefix) return null;
  const cells = line.slice(prefix[0].length).split(/\sI\s/i).map((cell) => cell.trim());
  if (cells.length < 2) return null;
  return { left: cells[0] ?? '', right: cells[1] ?? '' };
}

const text = fs.readFileSync(sample, 'utf8');
const lines = text.split(/\r?\n/);
let inTable = false;
let sawHeader = false;

for (const line of lines) {
  if (/LEFT.*RIGHT/i.test(line)) {
    inTable = true;
    sawHeader = true;
    console.log('header', line);
    continue;
  }
  if (!inTable || !sawHeader) continue;
  if (/C\s+-{5,}/.test(line)) {
    console.log('dash', line);
    continue;
  }
  const row = parseTableLine(line);
  if (row) console.log('row', row);
}
