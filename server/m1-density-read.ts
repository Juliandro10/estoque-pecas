import fs from 'node:fs';
import path from 'node:path';

import { parseDensityFromJac, parseMachineBedFromSin } from './jac-density';
import { parseRegulationFromSin } from './sin-regulation';
import { parseRegulationFromSetx } from './setx-regulation';
import { parseMachineFromSin, formatMachineLabel, syntechMaquinaFromSin } from './sin-machine';
import { parseYarnGuidesFromSin } from './sin-yarn';
import { parseKnittingWidthFromSin } from './sin-knitting-width';
import { parseCoursesFromSimx } from './simx-courses';
import { partBaseFromFileName, readSinText } from './sin-read';
import { readControleSintralForPart } from './sintral-screen';
import { resolveStollPartFiles } from './stoll-time';

export type M1DensityPartResult = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  error?: string;
  machine?: {
    cms: string;
    gauge: string;
    label: string;
    syntech_maquina: number | null;
  };
  sizes?: {
    wales: number | null;
    courses: number | null;
    wales_source?: string;
    courses_source?: string;
    machine_bed?: number | null;
    jac_lines?: number;
    sintral_cursos?: number | null;
    knitting_left?: number | null;
    knitting_right?: number | null;
    fixed_courses?: number | null;
    courses_breakdown?: string | null;
    sim_rows?: number | null;
  };
  regulation?: {
    primary_source: 'setx' | 'sin' | null;
    sin_nps: { np: number; value: number; label: string }[];
    setx_nps: { np: number; value: number; comment: string }[];
    setx_msec?: { key: string; value: number; comment: string }[];
    sin_npj?: { front?: string; rear?: string };
    ydf?: number;
    ygc?: string;
    mseci?: number;
  };
  yarns?: {
    guide: number;
    letter: string;
    description: string;
    pct?: number;
  }[];
  files?: {
    sin?: string;
    setx?: string;
    jac?: string;
    simx?: string;
  };
};

function readSinFromResolved(resolvedSin: string | undefined, modelFolder: string, partBase: string) {
  if (resolvedSin && fs.existsSync(resolvedSin)) {
    return { text: fs.readFileSync(resolvedSin, 'utf8'), sin_path: resolvedSin };
  }
  return readSinText(modelFolder, partBase);
}

function readJacFromResolved(resolvedJac: string | undefined, modelFolder: string, partBase: string) {
  if (resolvedJac && fs.existsSync(resolvedJac)) {
    return { text: fs.readFileSync(resolvedJac, 'utf8'), jac_path: resolvedJac };
  }

  const partDir = path.join(modelFolder, 'dados do programa', partBase);
  const primary = path.join(partDir, `${partBase}.jac`);
  if (fs.existsSync(primary)) {
    return { text: fs.readFileSync(primary, 'utf8'), jac_path: primary };
  }

  return null;
}

function readSimxFromResolved(resolvedSimx: string | undefined, modelFolder: string, partBase: string) {
  if (resolvedSimx && fs.existsSync(resolvedSimx)) {
    return { text: fs.readFileSync(resolvedSimx, 'utf8'), simx_path: resolvedSimx };
  }

  const partDir = path.join(modelFolder, 'dados do programa', partBase);
  const primary = path.join(partDir, `${partBase}.simx`);
  if (fs.existsSync(primary)) {
    return { text: fs.readFileSync(primary, 'utf8'), simx_path: primary };
  }

  const modelRoot = path.join(modelFolder, `${partBase}.simx`);
  if (fs.existsSync(modelRoot)) {
    return { text: fs.readFileSync(modelRoot, 'utf8'), simx_path: modelRoot };
  }

  return null;
}

function productionYarnLetters(yarns: { guide: number; letter: string }[]) {
  const letters = new Set<string>();
  for (const yarn of yarns) {
    if (yarn.guide <= 2) continue;
    if (yarn.letter) letters.add(yarn.letter);
  }
  return letters;
}

export function readM1DensityForPart(
  tmpDir: string,
  modelFolder: string,
  part: { label: string; file_name: string }
): M1DensityPartResult {
  const partBase = partBaseFromFileName(part.file_name);
  const resolved = resolveStollPartFiles(tmpDir, modelFolder, partBase);
  const sin = readSinFromResolved(resolved.sin, modelFolder, partBase);
  const jac = readJacFromResolved(resolved.jac, modelFolder, partBase);
  const simx = readSimxFromResolved(resolved.simx, modelFolder, partBase);

  const files = {
    sin: resolved.sin ? path.basename(resolved.sin) : undefined,
    setx: resolved.setx ? path.basename(resolved.setx) : undefined,
    jac: jac ? path.basename(jac.jac_path) : resolved.jac ? path.basename(resolved.jac) : undefined,
    simx: simx ? path.basename(simx.simx_path) : resolved.simx ? path.basename(resolved.simx) : undefined,
  };

  if (!sin) {
    return {
      label: part.label,
      file_name: part.file_name,
      part_base: partBase,
      ok: false,
      error: 'Sem .sin — processe a parte no M1.',
      files,
    };
  }

  const knitting = parseKnittingWidthFromSin(sin.text);
  const machineBed = knitting.machine_bed ?? parseMachineBedFromSin(sin.text);
  const jacParsed = jac ? parseDensityFromJac(jac.text, machineBed) : null;
  const sinReg = parseRegulationFromSin(sin.text);
  const yarnParsed = parseYarnGuidesFromSin(sin.text);
  const machineHeader = parseMachineFromSin(sin.text);
  const productionLetters = productionYarnLetters(yarnParsed.guides);

  const coursesParsed = simx
    ? parseCoursesFromSimx(simx.text, sin.text, knitting.wales, productionLetters)
    : null;

  let setxNps: { np: number; value: number; comment: string }[] = [];
  let setxMsec: { key: string; value: number; comment: string }[] = [];
  if (resolved.setx && fs.existsSync(resolved.setx)) {
    try {
      const setxParsed = parseRegulationFromSetx(fs.readFileSync(resolved.setx, 'utf8'));
      setxNps = setxParsed.nps.map((row) => ({
        np: row.np,
        value: row.value,
        comment: row.comment,
      }));
      setxMsec = setxParsed.msec;
    } catch {
      setxNps = [];
      setxMsec = [];
    }
  }

  let sintralCursos: number | null = null;
  try {
    const capture = readControleSintralForPart(modelFolder, partBase);
    if (capture?.simulation?.cursos != null) {
      sintralCursos = capture.simulation.cursos;
    }
  } catch {
    sintralCursos = null;
  }

  const wales = knitting.wales;
  const courses = coursesParsed?.courses ?? null;
  const hasSizes = wales != null && courses != null;

  let error: string | undefined;
  if (!hasSizes) {
    if (wales == null && courses == null) {
      error = 'Malhas (#L/#R no .sin) e passadas (.simx) não encontradas.';
    } else if (wales == null) {
      error = 'Malhas não encontradas no .sin (#L/#R).';
    } else if (!simx) {
      error = 'Passadas requerem .simx — processe a parte no M1.';
    } else {
      error = 'Passadas não encontradas no .simx (ciclos RS).';
    }
  }

  return {
    label: part.label,
    file_name: part.file_name,
    part_base: partBase,
    ok: hasSizes,
    error: hasSizes ? undefined : error,
    machine: machineHeader
      ? {
          cms: machineHeader.cms,
          gauge: machineHeader.gauge,
          label: formatMachineLabel(machineHeader),
          syntech_maquina: syntechMaquinaFromSin(machineHeader),
        }
      : undefined,
    sizes: {
      wales,
      courses,
      wales_source: knitting.wales_source,
      courses_source: coursesParsed?.courses_source ?? undefined,
      machine_bed: machineBed,
      jac_lines: jacParsed?.jac_lines,
      sintral_cursos: sintralCursos,
      knitting_left: knitting.left,
      knitting_right: knitting.right,
      fixed_courses: coursesParsed?.fixed_courses ?? null,
      courses_breakdown: coursesParsed?.breakdown_text ?? null,
      sim_rows: coursesParsed?.sim_rows ?? null,
    },
    regulation: {
      primary_source: setxNps.length > 0 ? 'setx' : sinReg.nps.length > 0 ? 'sin' : null,
      sin_nps: sinReg.nps,
      setx_nps: setxNps,
      setx_msec: setxMsec.length > 0 ? setxMsec : undefined,
      sin_npj: sinReg.npj,
      ydf: yarnParsed.ydf,
      ygc: yarnParsed.ygc,
      mseci: sinReg.mseci,
    },
    yarns: yarnParsed.guides.map((g) => ({
      guide: g.guide,
      letter: g.letter,
      description: g.description,
      pct: g.pct,
    })),
    files,
  };
}

export function readM1DensityForModel(
  tmpDir: string,
  modelFolder: string,
  parts: { label: string; file_name: string }[]
) {
  return parts.map((part) => readM1DensityForPart(tmpDir, modelFolder, part));
}
