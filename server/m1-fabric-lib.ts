import { readKnittSym, type KnittSymPalette } from './knitt-sym';
import { knittMatrixForIndex, readKnittTxt } from './knitt-txt';

export type M1FabricStitchDef = {
  char: string;
  index: number;
  matrix: number[][];
  highlight: string;
  body: string;
  shadow: string;
};

function symIndexForChar(palette: KnittSymPalette, ch: string) {
  const rows = palette.byChar.get(ch);
  const mode1 = rows?.find((row) => row.mode === 1) ?? rows?.[0];
  return mode1?.index ?? 1;
}

function fabricShadesForChar(palette: KnittSymPalette, ch: string) {
  const rows = palette.byChar.get(ch) ?? [];
  const mode3 = rows.find((row) => row.mode === 3);
  if (mode3 && mode3.colors.length >= 2) {
    return {
      highlight: mode3.colors[0],
      body: mode3.colors[1],
      shadow: mode3.colors[2] ?? mode3.colors[1],
    };
  }
  const mode1 = rows.find((row) => row.mode === 1) ?? rows[0];
  if (mode1) {
    return {
      highlight: mode1.colors[0],
      body: mode1.colors[1] ?? mode1.colors[0],
      shadow: 'rgb(40, 40, 40)',
    };
  }
  return {
    highlight: 'rgb(255, 255, 255)',
    body: 'rgb(180, 180, 180)',
    shadow: 'rgb(80, 80, 80)',
  };
}

export function buildM1FabricLibrary() {
  const sym = readKnittSym();
  const txt = readKnittTxt();
  const byChar = new Map<string, M1FabricStitchDef>();
  const stitches: M1FabricStitchDef[] = [];

  for (const ch of sym.byChar.keys()) {
    const index = symIndexForChar(sym, ch);
    const shades = fabricShadesForChar(sym, ch);
    const def: M1FabricStitchDef = {
      char: ch,
      index,
      matrix: knittMatrixForIndex(txt, index),
      highlight: shades.highlight,
      body: shades.body,
      shadow: shades.shadow,
    };
    byChar.set(ch, def);
    stitches.push(def);
  }

  stitches.sort((a, b) => a.char.localeCompare(b.char));

  return {
    ok: sym.entries.length > 0 && txt.ok,
    sym_path: sym.path,
    txt_path: txt.path,
    count: stitches.length,
    stitches,
    byChar,
  };
}

export function m1FabricLibForApi() {
  const lib = buildM1FabricLibrary();
  return {
    ok: lib.ok,
    sym_path: lib.sym_path,
    txt_path: lib.txt_path,
    count: lib.count,
    stitches: lib.stitches,
  };
}
