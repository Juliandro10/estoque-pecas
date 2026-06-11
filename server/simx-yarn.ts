export type SimxYarnLetterUsage = {
  letter: string;
  units: number;
  pct: number;
};

export type SimxYarnUsageResult = {
  by_letter: SimxYarnLetterUsage[];
  total_units: number;
};

function parseCarrierSpan(raw: string) {
  const parts = raw.trim().split(/\s*-\s*/);
  if (parts.length < 2) return 0;

  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;

  return Math.abs(a - b) + 1;
}

export function parseYarnUsageFromSimx(text: string): SimxYarnUsageResult {
  const sums = new Map<string, number>();
  const re = /<yarnCarrier[^>]*\byarnType="([^"]+)"[^>]*>([^<]+)<\/yarnCarrier>/gi;

  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const letter = match[1].trim().toUpperCase();
    if (!letter) continue;

    const span = parseCarrierSpan(match[2]);
    if (span <= 0) continue;

    sums.set(letter, (sums.get(letter) ?? 0) + span);
  }

  const total_units = [...sums.values()].reduce((sum, value) => sum + value, 0);
  const by_letter = [...sums.entries()]
    .map(([letter, units]) => ({
      letter,
      units,
      pct: total_units > 0 ? (units / total_units) * 100 : 0,
    }))
    .sort((a, b) => a.letter.localeCompare(b.letter, 'pt-BR'));

  return { by_letter, total_units };
}

export function pctByLetterFromSimx(text: string) {
  const usage = parseYarnUsageFromSimx(text);
  return new Map(usage.by_letter.map((row) => [row.letter.toUpperCase(), row.pct]));
}
