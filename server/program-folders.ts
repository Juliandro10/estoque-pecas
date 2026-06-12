/** Subpastas ignoradas dentro de cada programa (ex.: versões antigas / erradas). */
export const IGNORED_PROGRAM_SUBFOLDERS = new Set(['error']);

export function isIgnoredProgramSubfolder(name: string) {
  return IGNORED_PROGRAM_SUBFOLDERS.has(name.trim().toLowerCase());
}
