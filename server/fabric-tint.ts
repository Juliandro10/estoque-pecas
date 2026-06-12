export type Rgb = { r: number; g: number; b: number };

const DEFAULT_YARN: Record<string, string> = {
  A: '#234e82',
  B: '#9b2c4a',
  C: '#2f855a',
  D: '#8b5a2b',
  E: '#5a4fcf',
  F: '#718096',
  '*': '#4a5568',
};

export function parseRgb(input: string): Rgb | null {
  const m = input.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

export function rgbToCss({ r, g, b }: Rgb) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

export function hexToRgb(hex: string): Rgb {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

export function tintFabricShades(
  highlight: string,
  body: string,
  shadow: string,
  yarnHex: string
): { highlight: string; body: string; shadow: string } {
  const yarn = hexToRgb(yarnHex);
  const hi = mix(yarn, { r: 255, g: 255, b: 255 }, 0.42);
  const mid = yarn;
  const lo = mix(yarn, { r: 0, g: 0, b: 0 }, 0.35);

  const baseBody = parseRgb(body);
  if (baseBody && (baseBody.r + baseBody.g + baseBody.b) / 3 < 40) {
    return {
      highlight: rgbToCss({ r: 250, g: 250, b: 250 }),
      body: rgbToCss({ r: 245, g: 245, b: 245 }),
      shadow: rgbToCss({ r: 230, g: 230, b: 230 }),
    };
  }

  return {
    highlight: rgbToCss(hi),
    body: rgbToCss(mid),
    shadow: rgbToCss(lo),
  };
}

export function yarnHexForLetter(letter: string, custom?: Record<string, string>) {
  const key = letter.trim().toUpperCase();
  if (!key) return DEFAULT_YARN.A;
  return custom?.[key] ?? DEFAULT_YARN[key] ?? DEFAULT_YARN.A;
}

export function yarnMapFromGuides(guides: { letter: string }[]) {
  const map: Record<string, string> = {};
  for (const guide of guides) {
    map[guide.letter.toUpperCase()] = yarnHexForLetter(guide.letter);
  }
  return map;
}

export function pickYarnForMeshChar(char: string, yarnMap: Record<string, string>) {
  const key = char.trim().toUpperCase();
  if (key && yarnMap[key]) return yarnMap[key];
  if (yarnMap.A) return yarnMap.A;
  const first = Object.values(yarnMap)[0];
  return first ?? DEFAULT_YARN.A;
}
