import type { WktRow } from './wkt-read';

export type MeshPreviewMeta = {
  displayWidth: number;
  displayRows: number;
  totalRows: number;
  cropped: boolean;
};

function rowPatternScore(mesh: string) {
  const chars = mesh.replace(/[.\s]/g, '');
  return new Set(chars).size;
}

function centerCrop(mesh: string, targetWidth: number) {
  if (targetWidth <= 0) return mesh;
  if (mesh.length === targetWidth) return mesh;
  if (mesh.length < targetWidth) return mesh.padEnd(targetWidth, '.');
  const start = Math.floor((mesh.length - targetWidth) / 2);
  return mesh.slice(start, start + targetWidth);
}

function dominantMeshLength(rows: WktRow[]) {
  const freq = new Map<number, number>();
  for (const row of rows) {
    const len = row.mesh.length;
    if (len < 8) continue;
    freq.set(len, (freq.get(len) ?? 0) + 1);
  }
  let bestLen = 0;
  let bestCount = 0;
  for (const [len, count] of freq) {
    if (count > bestCount) {
      bestCount = count;
      bestLen = len;
    }
  }
  return bestLen;
}

function sampleEvenly<T>(items: T[], max: number) {
  if (items.length <= max) return items;
  const out: T[] = [];
  for (let i = 0; i < max; i++) {
    const idx = Math.floor((i * items.length) / max);
    out.push(items[idx]!);
  }
  return out;
}

/** Reduz milhares de carreiras a um swatch legível (padrão de ponto). */
export function buildMeshPreviewRows(
  rows: WktRow[],
  opts?: { maxRows?: number; knittingWidth?: number | null; maxDisplayWidth?: number }
): { rows: WktRow[]; meta: MeshPreviewMeta } {
  const maxRows = opts?.maxRows ?? 40;
  const maxDisplayWidth = opts?.maxDisplayWidth ?? 160;

  const withMesh = rows.filter((row) => row.mesh.length > 0 && rowPatternScore(row.mesh) > 0);
  if (!withMesh.length) {
    return {
      rows: [],
      meta: { displayWidth: 0, displayRows: 0, totalRows: rows.length, cropped: false },
    };
  }

  const dominantLen = dominantMeshLength(withMesh);
  let filtered = withMesh;
  if (dominantLen > 0) {
    filtered = withMesh.filter((row) => Math.abs(row.mesh.length - dominantLen) <= 4);
  }
  if (!filtered.length) filtered = withMesh;

  filtered = [...filtered].sort((a, b) => rowPatternScore(b.mesh) - rowPatternScore(a.mesh));
  const rich = filtered.filter((row) => rowPatternScore(row.mesh) >= 2);
  const pool = rich.length >= 8 ? rich : filtered;

  const block = sampleEvenly(pool, maxRows);
  const baseWidth = opts?.knittingWidth && opts.knittingWidth > 0 ? opts.knittingWidth : dominantLen;
  const displayWidth = Math.max(24, Math.min(baseWidth || dominantLen || 120, maxDisplayWidth));
  const cropped = (baseWidth || dominantLen) > displayWidth;

  const previewRows = block.map((row) => ({
    ...row,
    width: displayWidth,
    mesh: centerCrop(row.mesh, displayWidth),
  }));

  return {
    rows: previewRows,
    meta: {
      displayWidth,
      displayRows: previewRows.length,
      totalRows: rows.length,
      cropped,
    },
  };
}

export function filterSimxRowsByStrokeWidth(rows: WktRow[], knittingWidth: number | null) {
  if (!knittingWidth || knittingWidth <= 0) return rows;

  const exact = rows.filter((row) => row.width === knittingWidth);
  if (exact.length >= 8) return exact;

  const close = rows.filter((row) => Math.abs(row.width - knittingWidth) <= 4);
  if (close.length >= 8) return close;

  return rows;
}
