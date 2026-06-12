import fs from 'node:fs';

export type KnittSymEntry = {
  index: number;
  char: string;
  mode: number;
  colors: string[];
};

export type KnittSymPalette = {
  path: string | null;
  entries: KnittSymEntry[];
  byChar: Map<string, KnittSymEntry[]>;
};

const DEFAULT_KNITT_SYM =
  process.env.STOLL_KNITT_SYM ??
  'C:\\Program Files (x86)\\Stoll\\M1plus\\8.0.010\\Bitmap\\knitt.sym';

let cached: KnittSymPalette | null = null;

function rgbTriplet(r: number, g: number, b: number) {
  return `rgb(${r}, ${g}, ${b})`;
}

export function parseKnittSymText(text: string, sourcePath: string | null = null): KnittSymPalette {
  const entries: KnittSymEntry[] = [];
  const byChar = new Map<string, KnittSymEntry[]>();

  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*\d+TRUE\s+\d+'([^']*)'\s+(\d+)\s+([\d\s]+)!/);
    if (!match) continue;

    const char = match[1] || '.';
    const mode = Number(match[2]);
    const nums = match[3]
      .trim()
      .split(/\s+/)
      .map(Number)
      .filter((n) => Number.isFinite(n) && n >= 0 && n <= 255);

    const colors: string[] = [];
    for (let i = 0; i + 2 < nums.length; i += 3) {
      colors.push(rgbTriplet(nums[i], nums[i + 1], nums[i + 2]));
    }
    if (!colors.length && nums.length >= 3) {
      colors.push(rgbTriplet(nums[0], nums[1], nums[2]));
    }

    const index = Number(line.trim().match(/^(\d+)/)?.[1] ?? entries.length);
    const entry: KnittSymEntry = { index, char, mode, colors };
    entries.push(entry);
    const bucket = byChar.get(char) ?? [];
    bucket.push(entry);
    byChar.set(char, bucket);
  }

  return { path: sourcePath, entries, byChar };
}

export function readKnittSym(customPath?: string): KnittSymPalette {
  const symPath = customPath ?? DEFAULT_KNITT_SYM;
  if (!customPath && cached?.path === symPath) return cached;

  if (!fs.existsSync(symPath)) {
    const empty = parseKnittSymText('', null);
    if (!customPath) cached = empty;
    return empty;
  }

  const palette = parseKnittSymText(fs.readFileSync(symPath, 'utf8'), symPath);
  if (!customPath) cached = palette;
  return palette;
}

export function colorForKnitChar(palette: KnittSymPalette, ch: string, preferMode = 2) {
  const rows = palette.byChar.get(ch);
  if (!rows?.length) {
    if (ch === '.' || ch === ' ') return 'rgb(255, 255, 255)';
    return 'rgb(200, 200, 200)';
  }
  const hit = rows.find((row) => row.mode === preferMode) ?? rows[0];
  return hit.colors[0];
}

export function knittSymForApi() {
  const palette = readKnittSym();
  return {
    path: palette.path,
    ok: Boolean(palette.path && palette.entries.length > 0),
    count: palette.entries.length,
    chars: [...palette.byChar.keys()].sort(),
    entries: palette.entries.map((row) => ({
      index: row.index,
      char: row.char,
      mode: row.mode,
      color: row.colors[0],
    })),
  };
}
