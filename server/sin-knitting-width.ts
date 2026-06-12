import { parseMachineBedFromSin } from './jac-density';

export type SinKnittingWidth = {
  wales: number | null;
  left: number | null;
  right: number | null;
  wales_source: 'sin-lr-mode';
  machine_bed: number | null;
  width_hits: number;
};

/** Largura útil de tecimento (#L/#R dominante, exclui full-bed da máquina). */
export function parseKnittingWidthFromSin(text: string): SinKnittingWidth {
  const machine_bed = parseMachineBedFromSin(text);
  const spans: { left: number; right: number; width: number }[] = [];

  for (const match of text.matchAll(/#L=(\d+)[^\n]*#R=(\d+)/g)) {
    const left = Number(match[1]);
    const right = Number(match[2]);
    if (!Number.isFinite(left) || !Number.isFinite(right) || right < left) continue;
    const width = right - left + 1;
    if (width <= 1) continue;
    if (machine_bed != null && width >= machine_bed) continue;
    if (left === 1 && machine_bed != null && width >= machine_bed - 1) continue;
    spans.push({ left, right, width });
  }

  if (spans.length === 0) {
    return {
      wales: null,
      left: null,
      right: null,
      wales_source: 'sin-lr-mode',
      machine_bed,
      width_hits: 0,
    };
  }

  const freq = new Map<number, { count: number; left: number; right: number }>();
  for (const span of spans) {
    const row = freq.get(span.width);
    if (row) {
      row.count += 1;
    } else {
      freq.set(span.width, { count: 1, left: span.left, right: span.right });
    }
  }

  const top = [...freq.entries()].sort((a, b) => b[1].count - a[1].count || b[0] - a[0])[0];
  const mode = top[1];

  return {
    wales: top[0],
    left: mode.left,
    right: mode.right,
    wales_source: 'sin-lr-mode',
    machine_bed,
    width_hits: mode.count,
  };
}
