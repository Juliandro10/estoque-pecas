/** Utilitário — parse de .sin. Captura .sin no processamento: m1-sin-capture.ts */
export function parsePartBaseFromSin(text: string): string | null {
  const line = text.split(/\r?\n/)[0] ?? '';
  const cms = line.match(/CMS\d+\.(\S+)/i)?.[1];
  if (cms) return cms.replace(/[^A-Za-z0-9\-_.]/g, '');
  return null;
}
