import fs from 'node:fs';

export type KnittMatrix = number[][];

export type KnittTxtLibrary = {
  path: string | null;
  ok: boolean;
  count: number;
  byIndex: Map<number, KnittMatrix>;
};

const DEFAULT_KNITT_TXT =
  process.env.STOLL_KNITT_TXT ??
  'C:\\Program Files (x86)\\Stoll\\M1plus\\8.0.010\\Bitmap\\knitt.txt';

let cached: KnittTxtLibrary | null = null;

export function parseKnittTxtText(text: string, sourcePath: string | null = null): KnittTxtLibrary {
  const byIndex = new Map<number, KnittMatrix>();
  let currentIndex: number | null = null;
  let rows: number[][] = [];

  function flush() {
    if (currentIndex == null || rows.length !== 9) return;
    byIndex.set(currentIndex, rows.map((row) => [...row]));
    rows = [];
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const indexHead = rawLine.match(/^\s+(\d+)\s+!\s*index/i);
    if (indexHead) {
      flush();
      currentIndex = Number(indexHead[1]);
      continue;
    }

    if (!/matrix row/i.test(rawLine)) continue;
    const nums = rawLine
      .replace(/!.*/g, '')
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isFinite(n));
    if (nums.length >= 9) rows.push(nums.slice(0, 9));
  }
  flush();

  return { path: sourcePath, ok: byIndex.size > 0, count: byIndex.size, byIndex };
}

export function readKnittTxt(customPath?: string): KnittTxtLibrary {
  const txtPath = customPath ?? DEFAULT_KNITT_TXT;
  if (!customPath && cached?.path === txtPath) return cached;

  if (!fs.existsSync(txtPath)) {
    const empty = parseKnittTxtText('', null);
    if (!customPath) cached = empty;
    return empty;
  }

  const lib = parseKnittTxtText(fs.readFileSync(txtPath, 'utf8'), txtPath);
  if (!customPath) cached = lib;
  return lib;
}

export function defaultKnittMatrix(): KnittMatrix {
  return Array.from({ length: 9 }, () => Array(9).fill(1));
}

export function knittMatrixForIndex(lib: KnittTxtLibrary, index: number): KnittMatrix {
  return lib.byIndex.get(index) ?? defaultKnittMatrix();
}

export function knittTxtForApi() {
  const lib = readKnittTxt();
  const matrices: { index: number; matrix: number[][] }[] = [];
  for (const [index, matrix] of lib.byIndex) {
    matrices.push({ index, matrix });
  }
  matrices.sort((a, b) => a.index - b.index);
  return {
    path: lib.path,
    ok: lib.ok,
    count: lib.count,
    matrices,
  };
}
