export type SinCycleBlock = {
  rs_id: string;
  cycle_key: string;
  label: string;
  passes: number;
  is_protection: boolean;
  is_compensation: boolean;
};

function cycleFlags(label: string) {
  const lower = label.toLowerCase();
  return {
    is_protection: /protection thread|fio prote/i.test(lower),
    is_compensation: /compensation float|float and lock/i.test(lower),
  };
}

function countPasses(block: string) {
  const moves = block.match(/<<|>>/g);
  return moves?.length ?? 0;
}

/** Ciclos RS declarados no .sin (RBEG*RS dentro de FBEG:CYCLE). */
export function parseSinCycleBlocks(text: string): SinCycleBlock[] {
  const cycles: SinCycleBlock[] = [];
  const blockRe = /FBEG:(CYCLE-\d+);([\s\S]*?)FEND C ([^\n]+)/gi;

  for (const match of text.matchAll(blockRe)) {
    const body = match[2];
    const label = (match[3] ?? '').trim();
    const rbeg = body.match(/RBEG\*(RS\d+)/i);
    if (!rbeg) continue;

    const rendIdx = body.search(/\bREND\b/i);
    const inner = rendIdx >= 0 ? body.slice(0, rendIdx) : body;
    const flags = cycleFlags(label);

    cycles.push({
      rs_id: rbeg[1].toUpperCase(),
      cycle_key: match[1].toUpperCase(),
      label,
      passes: countPasses(inner),
      ...flags,
    });
  }

  return cycles;
}

export function productionSinCycles(cycles: SinCycleBlock[]) {
  return cycles.filter((cycle) => !cycle.is_protection && !cycle.is_compensation && cycle.passes > 0);
}
