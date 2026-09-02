const AMBIGUOUS_COLOR_TOKENS = new Set([
  'AZUL',
  'BEGE',
  'BLUE',
  'BRANCO',
  'CAFE',
  'CHUMBO',
  'FUCSIA',
  'GRAMA',
  'GREEN',
  'MARINHO',
  'MENTA',
  'NEVE',
  'NIGHT',
  'NUVEM',
  'OFF',
  'OURO',
  'PALHA',
  'PINK',
  'PRETO',
  'RED',
  'ROSA',
  'VERDE',
  'WHITE',
]);

/** Caractere � (U+FFFD) aparece quando o Firebird devolve Latin-1 lido como UTF-8. */
export function repairSyntechText(value: string): string {
  return value.replace(/\uFFFD/g, '');
}

export function normalizeSyntechName(value: string): string {
  return repairSyntechText(value)
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Remove I fantasma do separador LEFT I RIGHT / MDB quando a cor canônica existe. */
export function stripPhantomColorI(value: string, peers: string[] = []): string {
  const trimmed = value.trim();
  if (!trimmed || peers.length === 0) return trimmed;

  const parts = trimmed.split(/\s+/);
  const last = parts[parts.length - 1];
  if (!/I$/i.test(last) || last.length < 3) return trimmed;

  const base = last.slice(0, -1);
  if (base.length < 2) return trimmed;

  const candidate = [...parts.slice(0, -1), base].join(' ');
  const candidateNorm = normalizeSyntechName(candidate);
  const peerHit = peers.find((peer) => normalizeSyntechName(peer) === candidateNorm);
  if (peerHit) return peerHit;

  const lastNorm = normalizeSyntechName(base);
  const suffixHits = peers.filter((peer) => {
    const tokens = normalizeSyntechName(peer).split(' ').filter(Boolean);
    return tokens[tokens.length - 1] === lastNorm;
  });
  if (suffixHits.length === 1) return suffixHits[0];

  return trimmed;
}

/** Remove cores duplicadas com I fantasma (ex.: BRANCOI quando já existe BRANCO). */
export function dedupePhantomIColors(colors: string[]): string[] {
  const byNorm = new Map<string, string>();
  for (const color of colors) {
    byNorm.set(normalizeSyntechName(color), color);
  }

  return colors.filter((color) => {
    const stripped = stripPhantomColorI(color, colors);
    if (normalizeSyntechName(stripped) === normalizeSyntechName(color)) return true;
    return !byNorm.has(normalizeSyntechName(stripped));
  });
}

function nameTokens(value: string): string[] {
  return normalizeSyntechName(value).split(' ').filter(Boolean);
}

function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;

  const rows = a.length + 1;
  const cols = b.length + 1;
  const matrix = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let i = 0; i < rows; i++) matrix[i][0] = i;
  for (let j = 0; j < cols; j++) matrix[0][j] = j;

  for (let i = 1; i < rows; i++) {
    for (let j = 1; j < cols; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }

  return matrix[a.length][b.length];
}

function maxTokenDistance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

function tokenSimilar(a: string, b: string): boolean {
  if (a === b) return true;
  const maxLen = Math.max(a.length, b.length);
  return editDistance(a, b) <= maxTokenDistance(maxLen);
}

function tokensAlign(queryTokens: string[], candidateTokens: string[]): boolean {
  if (queryTokens.length !== candidateTokens.length) return false;
  for (let index = 0; index < queryTokens.length; index++) {
    if (!tokenSimilar(queryTokens[index], candidateTokens[index])) return false;
  }
  return true;
}

function compactName(value: string): string {
  return normalizeSyntechName(value).replace(/ /g, '');
}

function singleTokenQueryIsSafe(token: string, candidateTokens: string[]): boolean {
  if (candidateTokens.length !== 1) return false;
  const candidate = candidateTokens[0];
  if (token === candidate) return true;
  const maxLen = Math.max(token.length, candidate.length);
  const minLen = Math.min(token.length, candidate.length);
  if (maxLen - minLen > 1) return false;
  return editDistance(token, candidate) <= maxTokenDistance(minLen);
}

export function colorNamesMatch(query: string, candidate: string): boolean {
  const queryNorm = normalizeSyntechName(query);
  const candidateNorm = normalizeSyntechName(candidate);
  if (!queryNorm || !candidateNorm) return false;
  if (queryNorm === candidateNorm) return true;
  if (compactName(query) === compactName(candidate)) return true;

  const queryTokens = queryNorm.split(' ');
  const candidateTokens = candidateNorm.split(' ');

  if (queryTokens.length === 1) {
    if (AMBIGUOUS_COLOR_TOKENS.has(queryTokens[0])) return false;
    return singleTokenQueryIsSafe(queryTokens[0], candidateTokens);
  }

  if (queryTokens.length !== candidateTokens.length) return false;
  return tokensAlign(queryTokens, candidateTokens);
}

export function findBestColorMatch(query: string | null, candidates: string[]): string | null {
  if (!query?.trim()) return null;

  const catalog = dedupePhantomIColors(candidates);
  const repairedQuery = stripPhantomColorI(query, catalog);
  const queryNorm = normalizeSyntechName(repairedQuery);
  const exact = catalog.find((candidate) => normalizeSyntechName(candidate) === queryNorm);
  if (exact) return exact;

  const matches = catalog.filter((candidate) => colorNamesMatch(repairedQuery, candidate));
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const aliases = matches.every((left) =>
      matches.every((right) => colorNamesMatch(left, right))
    );
    if (aliases) return matches[0];

    let best = matches[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of matches) {
      const candidateNorm = normalizeSyntechName(candidate);
      const distance = editDistance(queryNorm.replace(/ /g, ''), candidateNorm.replace(/ /g, ''));
      if (distance < bestDistance) {
        best = candidate;
        bestDistance = distance;
      }
    }
    const runnersUp = matches.filter((candidate) => {
      const candidateNorm = normalizeSyntechName(candidate);
      return editDistance(queryNorm.replace(/ /g, ''), candidateNorm.replace(/ /g, '')) === bestDistance;
    });
    if (runnersUp.length === 1) return best;
  }

  return uniqueLastTokenColorMatch(queryNorm, catalog);
}

/** "PRATA" → "FIO LUREX PRATA" quando só um candidato termina com esse token. */
function uniqueLastTokenColorMatch(queryNorm: string, candidates: string[]): string | null {
  const queryLast = queryNorm.split(' ').filter(Boolean).pop() ?? '';
  if (!queryLast || queryLast.length < 4) return null;
  if (AMBIGUOUS_COLOR_TOKENS.has(queryLast)) return null;

  const hits = candidates.filter((candidate) => {
    const tokens = normalizeSyntechName(candidate).split(' ').filter(Boolean);
    return tokens[tokens.length - 1] === queryLast;
  });
  return hits.length === 1 ? hits[0] : null;
}

export function yarnTypeNamesMatch(query: string, candidate: string): boolean {
  const queryNorm = normalizeSyntechName(query);
  const candidateNorm = normalizeSyntechName(candidate);
  if (!queryNorm || !candidateNorm) return false;
  if (queryNorm === candidateNorm) return true;
  if (compactName(query) === compactName(candidate)) return true;

  const queryTokens = nameTokens(query);
  const candidateTokens = nameTokens(candidate);
  if (queryTokens.length !== candidateTokens.length) return false;
  return tokensAlign(queryTokens, candidateTokens);
}

export function findBestYarnTypeMatch(query: string, candidates: string[]): string | null {
  const text = query.trim();
  if (!text || candidates.length === 0) return null;

  const ordered = [...candidates].sort((a, b) => b.length - a.length);
  const textTokens = text.split(/\s+/);

  for (const candidate of ordered) {
    const candidateTokens = candidate.trim().split(/\s+/);
    if (candidateTokens.length > textTokens.length) continue;

    const prefix = textTokens.slice(0, candidateTokens.length).join(' ');
    if (yarnTypeNamesMatch(prefix, candidate)) return candidate;
  }

  return null;
}

export function findYarnTypeIndex<T extends { tipo: string }>(query: string, types: T[]): number {
  const match = findBestYarnTypeMatch(query, types.map((item) => item.tipo));
  if (!match) return -1;
  return types.findIndex((item) => item.tipo === match);
}
