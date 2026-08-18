import { findBestYarnTypeMatch } from './syntech-name-match';

export type ParsedYarnDescription = {
  tipo: string;
  cabo: string | null;
  cor: string | null;
};

export type ParsedYarnComponent = ParsedYarnDescription & {
  /** Trecho original parseado (ex.: CAPRICE OFF 1 CABO). */
  raw: string;
};

const CABO_MARKER = /(\d+)\s+CABO(?:S(?:I)?)?\b/i;

function stripSupplierCode(text: string) {
  const match = text.match(/^(\d{3})\s+(.+)$/);
  return match ? match[2].trim() : text;
}

function splitTipoCor(body: string, yarnTypes: string[]): { tipo: string; cor: string | null } {
  const normalized = body.trim();
  if (!normalized) return { tipo: '', cor: null };

  const matchedType = findBestYarnTypeMatch(normalized, yarnTypes);
  if (matchedType) {
    const typeWords = matchedType.trim().split(/\s+/).length;
    const bodyWords = normalized.split(/\s+/);
    const cor = bodyWords.slice(typeWords).join(' ').trim();
    return { tipo: matchedType, cor: cor || null };
  }

  const upper = normalized.toUpperCase();
  for (const type of [...yarnTypes].sort((a, b) => b.length - a.length)) {
    const token = type.trim().toUpperCase();
    if (!token) continue;
    if (upper === token) return { tipo: type, cor: null };
    if (upper.startsWith(`${token} `)) {
      const cor = normalized.slice(type.length).trim();
      return { tipo: type, cor: cor || null };
    }
  }

  const parts = normalized.split(/\s+/);
  if (parts.length === 1) return { tipo: parts[0], cor: null };
  return { tipo: parts[0], cor: parts.slice(1).join(' ') };
}

function splitRepeatedCaboSegments(text: string): string[] {
  const markers = [...text.matchAll(/(\d+)\s+CABO(?:S(?:I)?)?\b/gi)];
  if (markers.length <= 1) return [text];

  const segments: string[] = [];
  let start = 0;
  for (const marker of markers) {
    if (marker.index === undefined) continue;
    const end = marker.index + marker[0].length;
    const segment = text.slice(start, end).trim();
    if (segment) segments.push(segment);
    start = end;
  }

  const trailing = text.slice(start).trim();
  if (trailing && segments.length > 0) {
    segments[segments.length - 1] = `${segments[segments.length - 1]} ${trailing}`.trim();
  }

  return segments.filter((segment) => CABO_MARKER.test(segment));
}

function parseSingleYarnSegment(
  text: string,
  yarnTypes: string[]
): ParsedYarnComponent | null {
  const parsed = parseYarnDescription(text, yarnTypes);
  if (!parsed.tipo && !parsed.cabo) return null;
  return { ...parsed, raw: text.trim() };
}

function componentLabel(component: ParsedYarnDescription) {
  const cor = component.cor ? ` ${component.cor}` : '';
  const cabo = component.cabo ? ` ${component.cabo} CABO` : '';
  return `${component.tipo}${cor}${cabo}`.trim();
}

/** Vários fios no mesmo guia (ex.: CAPRICE 1 CABO + LINHA 1 CABO). */
export function parseYarnDescriptionComponents(
  description: string,
  yarnTypes: string[] = []
): ParsedYarnComponent[] {
  const text = description.trim();
  if (!text) return [];

  const plusSegments = text
    .split(/\s*\+\s*/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const rawSegments: string[] = [];
  for (const segment of plusSegments) {
    rawSegments.push(...splitRepeatedCaboSegments(segment));
  }

  const segments = rawSegments.length > 0 ? rawSegments : [text];
  const components = segments
    .map((segment) => parseSingleYarnSegment(segment, yarnTypes))
    .filter((item): item is ParsedYarnComponent => item !== null);

  if (components.length <= 1) return components;
  return components;
}

export function formatYarnComponentDescription(component: ParsedYarnDescription) {
  return componentLabel(component);
}

export function buildCorrectedYarnDescription(
  parsed: ParsedYarnDescription,
  tipoName?: string | null,
  corName?: string | null
): string {
  return formatYarnComponentDescription({
    tipo: (tipoName ?? parsed.tipo).trim(),
    cabo: parsed.cabo,
    cor: corName ?? parsed.cor,
  });
}

export function parseYarnDescription(
  description: string,
  yarnTypes: string[] = []
): ParsedYarnDescription {
  const text = description.trim();
  if (!text) return { tipo: '', cabo: null, cor: null };

  const caboMatch = text.match(CABO_MARKER);
  if (!caboMatch || caboMatch.index === undefined) {
    return { tipo: text, cabo: null, cor: null };
  }

  const cabo = caboMatch[1];
  const caboStart = caboMatch.index;
  const caboEnd = caboStart + caboMatch[0].length;
  const before = text.slice(0, caboStart).trim();
  const after = text.slice(caboEnd).trim();

  if (after) {
    return { tipo: before, cabo, cor: after };
  }

  const body = stripSupplierCode(before);
  const { tipo, cor } = splitTipoCor(body, yarnTypes);
  return { tipo, cabo, cor };
}
