/** Graduações de tamanho na produção — arquivos com estes sufixos ficam fora do Desenv-Cadastro. */
const GRADUATION_SIZE_TOKENS = new Set([
  'PP',
  'P',
  'M',
  'G',
  'GG',
  'XP',
  'XG',
  'XXG',
  'XXP',
  'XS',
  'S',
  'L',
  'XL',
  'XXL',
]);

function mdvSegments(fileName: string) {
  return fileName
    .replace(/\.mdv$/i, '')
    .trim()
    .split('-')
    .filter(Boolean);
}

/**
 * Programa graduado (produção): ex. 5433-BLUSA-TRANCAS-FT-M.mdv.
 * Desenvolvimento fica sem tamanho: 5433-BLUSA-TRANCAS-FT.mdv.
 * Também ...-CT-P-4 (tamanho + numeração).
 */
export function isGraduatedMdvFile(fileName: string) {
  const segments = mdvSegments(fileName);
  if (segments.length < 2) return false;

  const last = segments[segments.length - 1].toUpperCase();
  if (/^\d+$/.test(last)) {
    const prev = segments[segments.length - 2]?.toUpperCase() ?? '';
    return GRADUATION_SIZE_TOKENS.has(prev);
  }

  return GRADUATION_SIZE_TOKENS.has(last);
}

export function isDevelopmentMdvFile(fileName: string) {
  return /\.mdv$/i.test(fileName) && !isGraduatedMdvFile(fileName);
}
