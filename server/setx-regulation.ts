export type SetxNpRow = {
  np: number;
  value: number;
  value2?: string;
  comment: string;
};

export type SetxMsecRow = {
  key: string;
  value: number;
  comment: string;
};

export type SetxRegulationParse = {
  nps: SetxNpRow[];
  msec: SetxMsecRow[];
};

export function parseRegulationFromSetx(text: string): SetxRegulationParse {
  const nps: SetxNpRow[] = [];

  for (const match of text.matchAll(/<NP(\d+)\s+Value="([^"]+)"(?:\s+Value2="([^"]*)")?\s+Comment="([^"]*)"\s*\/>/gi)) {
    nps.push({
      np: Number(match[1]),
      value: Number(String(match[2]).replace(',', '.')),
      value2: match[3] || undefined,
      comment: match[4] ?? '',
    });
  }

  nps.sort((a, b) => a.np - b.np);

  const msec: SetxMsecRow[] = [];
  for (const match of text.matchAll(/<MSEC(\w+)\s+Value="([^"]+)"(?:\s+Comment="([^"]*)")?\s*\/>/gi)) {
    const raw = String(match[2]).split(',')[0]?.replace(',', '.') ?? '';
    const value = Number(raw);
    if (!Number.isFinite(value)) continue;
    msec.push({
      key: `MSEC${match[1]}`,
      value,
      comment: match[3] ?? '',
    });
  }

  return { nps, msec };
}
