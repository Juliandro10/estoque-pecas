export type SinNpRow = {
  np: number;
  value: number;
  label: string;
};

export type SinRegulationParse = {
  nps: SinNpRow[];
  mseci?: number;
  npj?: { front?: string; rear?: string };
};

export function parseRegulationFromSin(text: string): SinRegulationParse {
  const nps: SinNpRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    const np = line.match(/^\s*\d+\s+C\s+NP(\d+)=(\d+(?:\.\d+)?)\s+(.*)$/i);
    if (np) {
      nps.push({
        np: Number(np[1]),
        value: Number(np[2]),
        label: np[3].trim(),
      });
      continue;
    }

    const npInline = line.match(/^\s*\d+\s+NP(\d+)=(\d+(?:\.\d+)?)\s+(.*)$/i);
    if (npInline) {
      nps.push({
        np: Number(npInline[1]),
        value: Number(npInline[2]),
        label: npInline[3].trim(),
      });
    }
  }

  nps.sort((a, b) => a.np - b.np);

  const mseci = Number(text.match(/^\s*\d+\s+C\s+MSECI=(\d+(?:\.\d+)?)/im)?.[1]);

  const npjFront = text.match(/NPJ1:([^\n]+)/i)?.[1]?.trim();
  const npjRear = text.match(/NPJ2:([^\n]+)/i)?.[1]?.trim();

  return {
    nps,
    mseci: Number.isFinite(mseci) ? mseci : undefined,
    npj:
      npjFront || npjRear
        ? {
            front: npjFront,
            rear: npjRear,
          }
        : undefined,
  };
}
