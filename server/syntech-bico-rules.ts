/** Código TIPO_FIO fixo por bico (independe da descrição no .sin). */
export const FIXED_BICO_TIPO_FIO: Record<number, number> = {
  1: 70, // RESTO DE FIO — separação
  2: 13, // LASTEX — elástico pente
};

export const RESTO_FIO_CODIGO = 70;
export const RESTO_FIO_NOME = 'RESTO DE FIO';
export const GUIA_COR_BICO_8 = 'VARIADOS';

const SINGLE_CABO_BICOS = new Set([1, 2]);

export function parseCaboFromDescription(description: string) {
  const text = description.trim();
  const numeric = text.match(/(\d+)\s+CABOS?\w*/i);
  if (numeric) return numeric[1];
  if (/\bDOIS\s+CABOS?\b/i.test(text)) return '2';
  if (/\bTRES\s+CABOS?\b/i.test(text)) return '3';
  return null;
}

export function resolveCaboForBico(bico: number, description: string, parsedCabo: string | null) {
  if (SINGLE_CABO_BICOS.has(bico)) return '1';

  if (bico === 8) {
    return parseCaboFromDescription(description) ?? parsedCabo;
  }

  return parsedCabo;
}

export function resolveCaboNumberForBico(
  bico: number,
  description: string,
  parsedCabo: string | null
): number | null {
  const text = resolveCaboForBico(bico, description, parsedCabo);
  if (!text) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}
