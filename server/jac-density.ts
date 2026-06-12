export type JacDensityParse = {
  wales: number | null;
  courses: number | null;
  wales_source?: 'jac-star-w' | 'jac-plus-end';
  courses_source?: 'jac-star-h' | 'jac-line-count';
  jac_lines: number;
  machine_bed: number | null;
  star_segments: number;
  plus_end_hits: number;
};

/** Largura total da máquina (F1 em M1-SIZES) — só para filtrar falsos positivos. */
export function parseMachineBedFromSin(text: string): number | null {
  const sizesBlock = text.match(/FBEG:M1-SIZES;[\s\S]*?FEND C M1-SIZES/i)?.[0] ?? '';
  const f1 = sizesBlock.match(/F1=(\d+)-(\d+)/i);
  if (!f1) return null;
  const start = Number(f1[1]);
  const end = Number(f1[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  return end - start + 1;
}

function modeValue(values: number[]) {
  if (values.length === 0) return null;
  const freq = new Map<number, number>();
  for (const value of values) {
    freq.set(value, (freq.get(value) ?? 0) + 1);
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

/**
 * Malhas/passadas reais a partir do .jac (texto Sintral/jacquard).
 * Não usar M1-SIZES (largura da máquina) nem JA1 (linha Sintral).
 */
export function parseDensityFromJac(jacText: string, machineBed?: number | null): JacDensityParse {
  const lines = jacText.split(/\r?\n/).filter((line) => line.trim());
  const bed = machineBed && machineBed > 0 ? machineBed : null;
  const bedLimit = bed ?? 99999;

  const starRows: { w: number; h: number }[] = [];
  const plusEnd: number[] = [];

  for (const line of lines) {
    const star = line.match(/=(\d+)\*(\d+)\+/);
    if (star) {
      starRows.push({ w: Number(star[1]), h: Number(star[2]) });
    }
    const plus = line.match(/\+(\d+)\.\s*$/);
    if (plus) {
      plusEnd.push(Number(plus[1]));
    }
  }

  const starFiltered = starRows.filter((row) => row.w > 0 && row.w < bedLimit);

  let wales: number | null = null;
  let wales_source: JacDensityParse['wales_source'];
  let courses: number | null = null;
  let courses_source: JacDensityParse['courses_source'];

  if (starFiltered.length > 0) {
    wales = Math.max(...starFiltered.map((row) => row.w));
    wales_source = 'jac-star-w';

    const hs = starFiltered.filter((row) => row.w === wales).map((row) => row.h);
    if (hs.length > 0) {
      courses = Math.max(...hs);
      courses_source = 'jac-star-h';
    }
  }

  if (wales === null && plusEnd.length > 0) {
    const filtered = plusEnd.filter((n) => n >= 10 && n < bedLimit * 0.95);
    const mode = modeValue(filtered);
    if (mode != null) {
      wales = mode;
      wales_source = 'jac-plus-end';
    }
  }

  if (courses === null && lines.length > 0) {
    courses = lines.length;
    courses_source = 'jac-line-count';
  }

  return {
    wales,
    courses,
    wales_source,
    courses_source,
    jac_lines: lines.length,
    machine_bed: bed,
    star_segments: starFiltered.length,
    plus_end_hits: plusEnd.length,
  };
}
