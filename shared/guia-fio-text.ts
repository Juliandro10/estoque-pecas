/** Rótulos de matéria-prima (até 16 linhas) e texto curto da ficha GUIA_FIO (40 chars). */

const GUIA_TEXT_MAX = 40;
const PARTE_LABEL_MAX = 16;

const TIPO_ABBR: [RegExp, string][] = [
  [/POWER\s*BRIGHT/i, 'PB'],
  [/ELASTANO(?:\s*20\s*\/\s*20)?/i, 'ELAST'],
  [/POLISTE?R(?:\s*HB(?:\s*2\/28)?)?/i, 'POLI'],
  [/FIO\s*LANTEJOU?LA|LANTEJOU?LA|PAETE/i, 'PAETE'],
  [/LUREX|FIO\s*METALIZADO/i, 'LUREX'],
  [/SEPARACAO/i, 'SEP'],
  [/ELASTICO(?:\s+(?:DE\s+)?PENTE)?/i, 'EL.PENTE'],
  [/LASTEX/i, 'LASTEX'],
];

const PART_KIND_TOKENS = [
  'ACAB',
  'CORPO',
  'FRENTE',
  'COSTAS',
  'MANGA',
  'PUNHO',
  'GOLA',
  'CT',
  'FT',
  'MG',
  'MN',
] as const;

export type YarnSide = 'left' | 'right';

export type BicoLabelRow = {
  guide: number;
  slot?: number;
  letter?: string;
  side?: YarnSide;
  parts?: string[];
  componentIndex?: number;
};

export type GuiaSideYarnNote = {
  description: string;
  parts: string[];
  cabo?: string | null;
};

function clipAscii(value: string, maxLen: number) {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return ascii.slice(0, maxLen);
}

function abbreviateTipo(tipo: string) {
  const text = tipo.trim();
  if (!text) return '';
  for (const [pattern, abbr] of TIPO_ABBR) {
    if (pattern.test(text)) return abbr;
  }
  return text
    .split(/\s+/)
    .slice(0, 2)
    .join(' ')
    .toUpperCase();
}

function caboMarker(description: string) {
  return description.match(/(\d+)\s+CABOS?\w*/i);
}

export function shortPartKind(value: string) {
  const text = value.trim().toUpperCase();
  if (!text) return '';
  for (const token of PART_KIND_TOKENS) {
    if (text === token || text.endsWith(`-${token}`) || text.includes(`-${token}-`) || text.endsWith(token)) {
      if (token === 'FRENTE') return 'FT';
      if (token === 'COSTAS') return 'CT';
      if (token === 'MANGA') return 'MG';
      return token;
    }
  }
  return '';
}

function uniquePartKinds(parts: string[]) {
  const seen = new Set<string>();
  const kinds: string[] = [];
  for (const part of parts) {
    const kind = shortPartKind(part);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    kinds.push(kind);
  }
  return kinds;
}

function isAcabOnly(parts: string[] | undefined) {
  const kinds = uniquePartKinds(parts ?? []);
  return kinds.length > 0 && kinds.every((kind) => kind === 'ACAB' || kind === 'GOLA');
}

/** Corpo/listras na barra física; ACAB/gola vai para slot extra. */
export function nativeBicoSlotPriority(row: Pick<BicoLabelRow, 'side' | 'parts'>) {
  if (isAcabOnly(row.parts)) return 2;
  if (row.side === 'right') return 0;
  if (row.side === 'left') return 1;
  return 1;
}

export function compactYarnToken(description: string) {
  const text = description.trim();
  if (!text) return '';
  const caboMatch = caboMarker(text);
  let tipo = text;
  let cor = '';
  let cabo = '';
  if (caboMatch && caboMatch.index !== undefined) {
    tipo = text.slice(0, caboMatch.index).trim();
    cabo = caboMatch[1] === '1' ? '' : `${caboMatch[1]}C`;
    cor = text.slice(caboMatch.index + caboMatch[0].length).trim();
  }
  const tipoAbbr = abbreviateTipo(tipo);
  const corAbbr = cor.replace(/\s+/g, ' ').toUpperCase();
  return [tipoAbbr, cabo, corAbbr].filter(Boolean).join(' ');
}

/** Texto da ficha física (não é nome de tipo Syntech). */
export function isCompactGuiaNote(text: string) {
  const value = text.trim();
  if (!value) return false;
  return /[()]/.test(value) || /\s\/\s/.test(value);
}

export function compactGuiaSideNote(items: GuiaSideYarnNote[]) {
  if (items.length === 0) return '';

  const bits = items.map((item) => {
    const token = compactYarnToken(item.description);
    const parts = uniquePartKinds(item.parts).join('/');
    return parts ? `${token} (${parts})` : token;
  });

  let text = bits.join(' / ');
  if (text.length <= GUIA_TEXT_MAX) return clipAscii(text, GUIA_TEXT_MAX);

  const withoutParts = items.map((item) => compactYarnToken(item.description)).join(' / ');
  if (withoutParts.length <= GUIA_TEXT_MAX) return clipAscii(withoutParts, GUIA_TEXT_MAX);

  return clipAscii(withoutParts, GUIA_TEXT_MAX);
}

export function bicoProcessoLabel(row: BicoLabelRow, siblings: BicoLabelRow[]) {
  const sameGuide = siblings.filter((item) => item.guide === row.guide);
  if (sameGuide.length <= 1) {
    return clipAscii(`BICO ${row.guide}`, PARTE_LABEL_MAX);
  }

  if ((row.componentIndex ?? 0) > 0) {
    return clipAscii(`BICO ${row.guide} MIX`, PARTE_LABEL_MAX);
  }

  if (isAcabOnly(row.parts)) {
    const kind = uniquePartKinds(row.parts ?? [])[0] ?? 'ACAB';
    return clipAscii(`BICO ${row.guide} ${kind}`, PARTE_LABEL_MAX);
  }

  const sideTag = row.side === 'left' ? 'ESQ' : row.side === 'right' ? 'DIR' : '';
  const sameSide = sideTag
    ? sameGuide.filter((item) => item.side === row.side && !isAcabOnly(item.parts))
    : sameGuide;

  if (sideTag && sameSide.length <= 1) {
    return clipAscii(`BICO ${row.guide} ${sideTag}`, PARTE_LABEL_MAX);
  }

  const kinds = uniquePartKinds(row.parts ?? []);
  if (kinds.length === 1) {
    return clipAscii(`BICO ${row.guide} ${kinds[0]}`, PARTE_LABEL_MAX);
  }

  const letter = (row.letter ?? '').trim().toUpperCase();
  if (letter) {
    return clipAscii(`BICO ${row.guide} ${letter}`, PARTE_LABEL_MAX);
  }

  return clipAscii(`BICO ${row.guide}`, PARTE_LABEL_MAX);
}

export function mergeYarnSides(
  existing: YarnSide | undefined,
  incoming: YarnSide | undefined
): YarnSide | undefined {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (existing !== incoming) return undefined;
  return existing;
}
