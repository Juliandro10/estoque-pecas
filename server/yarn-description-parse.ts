export type ParsedYarnDescription = {
  tipo: string;
  cabo: string | null;
  cor: string | null;
};

const CABO_MARKER = /(\d+)\s+CABOS?\w*/i;

function stripSupplierCode(text: string) {
  const match = text.match(/^(\d{3})\s+(.+)$/);
  return match ? match[2].trim() : text;
}

function splitTipoCor(body: string, yarnTypes: string[]): { tipo: string; cor: string | null } {
  const normalized = body.trim();
  if (!normalized) return { tipo: '', cor: null };

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
