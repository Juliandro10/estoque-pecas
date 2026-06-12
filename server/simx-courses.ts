import { parseSinCycleBlocks, productionSinCycles, type SinCycleBlock } from './sin-cycles';

export type M1CycleContribution = {
  rs_id: string;
  label: string;
  predef: number;
  passes_per_cycle: number;
  overlap: number;
  contribution: number;
  source: 'simx-expanded' | 'sin-formula';
};

export type SimxCoursesParse = {
  courses: number | null;
  courses_source: 'simx-rs-expanded' | 'simx-rs-formula' | 'simx-prod-lines' | null;
  fixed_courses: number | null;
  cycles: M1CycleContribution[];
  breakdown_text: string | null;
  sim_rows: number | null;
};

type SimLineRow = {
  id: number;
  width: number;
  yarn: string;
  repeat_def: string;
};

function parseRsPredefs(simxText: string) {
  const predefs = new Map<string, number>();
  for (const match of simxText.matchAll(/<counter id="(RS\d+)">(\d+)<\/counter>/gi)) {
    const id = match[1].toUpperCase();
    const value = Number(match[2]);
    predefs.set(id, Math.max(predefs.get(id) ?? 0, value));
  }
  return predefs;
}

function parseSimLines(simxText: string): SimLineRow[] {
  const rows: SimLineRow[] = [];
  const strokeRe = /<simStroke id="\d+">([\s\S]*?)<\/simStroke>/gi;

  for (const stroke of simxText.matchAll(strokeRe)) {
    const block = stroke[1];
    const left = Number(block.match(/<counter id="#L">(\d+)<\/counter>/)?.[1] ?? 0);
    const right = Number(block.match(/<counter id="#R">(\d+)<\/counter>/)?.[1] ?? 0);
    const width = right >= left ? right - left + 1 : 0;

    for (const line of block.matchAll(/<simLine id="(\d+)">([\s\S]*?)<\/simLine>/gi)) {
      const body = line[2];
      rows.push({
        id: Number(line[1]),
        width,
        yarn: body.match(/yarnType="([^"]+)"/)?.[1] ?? '',
        repeat_def: body.match(/<repeatDef>([^<]+)<\/repeatDef>/)?.[1]?.trim() ?? '',
      });
    }
  }

  return rows;
}

function isProductionLine(row: SimLineRow, knittingWidth: number | null, productionLetters: Set<string>) {
  if (knittingWidth != null && row.width !== knittingWidth) return false;
  if (productionLetters.size === 0) return row.yarn !== 'A' && row.yarn !== 'B' && row.yarn !== '';
  return productionLetters.has(row.yarn);
}

function uniqueIdsForRs(production: SimLineRow[], rsId: string) {
  return [...new Set(production.filter((row) => row.repeat_def.includes(rsId)).map((row) => row.id))];
}

function fixedBeforeRs(production: SimLineRow[], rsId: string) {
  const firstIdx = production.findIndex((row) => row.repeat_def.includes(rsId));
  if (firstIdx <= 0) return 0;
  return new Set(production.slice(0, firstIdx).map((row) => row.id)).size;
}

function buildContribution(
  cycle: SinCycleBlock,
  predef: number,
  production: SimLineRow[],
  expandedIds: number[]
): M1CycleContribution {
  let passes = cycle.passes;
  let source: M1CycleContribution['source'] = 'sin-formula';
  let contribution = predef * passes;

  if (expandedIds.length > 0) {
    passes = Math.max(1, Math.round(expandedIds.length / predef));
    contribution = expandedIds.length;
    source = 'simx-expanded';
  }

  const overlap = passes > 0 && predef > 1 ? passes : 0;

  return {
    rs_id: cycle.rs_id,
    label: cycle.label,
    predef,
    passes_per_cycle: passes,
    overlap,
    contribution,
    source,
  };
}

function formatBreakdown(fixed: number | null, cycle: M1CycleContribution | null) {
  if (!cycle) return null;
  const core = `${cycle.rs_id}(${cycle.predef}×${cycle.passes_per_cycle}) = ${cycle.contribution}`;
  if (fixed != null && fixed > 0) {
    return `${core} · ${fixed} fixo antes do ciclo`;
  }
  return core;
}

export function parseCoursesFromSimx(
  simxText: string,
  sinText: string,
  knittingWidth: number | null,
  productionLetters: Set<string>
): SimxCoursesParse {
  const sim_rows = Number(simxText.match(/<simRows>(\d+)<\/simRows>/)?.[1] ?? 0) || null;
  const sinCycles = parseSinCycleBlocks(sinText);
  const productionCycles = productionSinCycles(sinCycles);
  const rsPredefs = parseRsPredefs(simxText);
  const simLines = parseSimLines(simxText);
  const production = simLines.filter((row) => isProductionLine(row, knittingWidth, productionLetters));

  if (production.length === 0 && productionCycles.length === 0) {
    return {
      courses: null,
      courses_source: null,
      fixed_courses: null,
      cycles: [],
      breakdown_text: null,
      sim_rows,
    };
  }

  const contributions: M1CycleContribution[] = [];

  for (const cycle of productionCycles) {
    const predef = rsPredefs.get(cycle.rs_id) ?? 0;
    if (predef <= 1) continue;
    const expandedIds = uniqueIdsForRs(production, cycle.rs_id);
    contributions.push(buildContribution(cycle, predef, production, expandedIds));
  }

  contributions.sort((a, b) => b.contribution - a.contribution);

  let dominant = contributions[0] ?? null;
  let courses: number | null = dominant?.contribution ?? null;
  let courses_source: SimxCoursesParse['courses_source'] = dominant?.source ?? null;
  let fixed_courses: number | null = null;

  if (dominant) {
    fixed_courses = fixedBeforeRs(production, dominant.rs_id);
  } else if (production.length > 0) {
    courses = new Set(production.map((row) => row.id)).size;
    courses_source = 'simx-prod-lines';
  } else {
    for (const cycle of productionCycles) {
      const predef = rsPredefs.get(cycle.rs_id) ?? 0;
      if (predef <= 1) continue;
      contributions.push(buildContribution(cycle, predef, production, []));
    }
    contributions.sort((a, b) => b.contribution - a.contribution);
    dominant = contributions[0] ?? null;
    courses = dominant?.contribution ?? null;
    courses_source = dominant ? 'simx-rs-formula' : null;
  }

  return {
    courses,
    courses_source,
    fixed_courses,
    cycles: contributions,
    breakdown_text: formatBreakdown(fixed_courses, dominant),
    sim_rows,
  };
}
