/** Extrai código Syntech explícito no início da descrição do fio. */
export function parseSyntechCodeLead(description: string): { codigo: number; rest: string } | null {
  const text = description.trim();
  if (!text) return null;

  const explicit = text.match(/^(?:CODIGO|CÓDIGO|COD\.?)\s*(\d{1,3})\s*(?:[-–—:]\s*)?(.*)$/i);
  if (explicit) {
    const codigo = Number(explicit[1]);
    if (!Number.isFinite(codigo)) return null;
    return { codigo, rest: explicit[2].trim() };
  }

  const dashed = text.match(/^(\d{1,3})\s*[-–—:]\s+(.+)$/);
  if (dashed) {
    const codigo = Number(dashed[1]);
    if (!Number.isFinite(codigo)) return null;
    return { codigo, rest: dashed[2].trim() };
  }

  return null;
}

/** Grava o código como identidade; o restante da frase vira rótulo. */
export function stampSyntechCodeLead(description: string, codigo: number): string {
  const rest = parseSyntechCodeLead(description)?.rest ?? description.trim();
  if (!rest) return `Codigo ${codigo}`;
  return `Codigo ${codigo} - ${rest}`;
}

export function stripSyntechCodeLead(description: string): string {
  return parseSyntechCodeLead(description)?.rest ?? description.trim();
}
