import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const m1KnowledgePath = path.join(__dirname, '..', 'data', 'm1-knowledge.json');

export type M1StitchType = {
  id: string;
  code: string;
  name: string;
  visual?: {
    stitch?: string;
    icon?: string;
    malhas?: string;
  };
};

export type M1MeasurementYarn = {
  bico: number;
  sinDescription: string;
  sinDescriptionKey: string;
  syntechCod?: number | null;
  syntechDesc?: string | null;
  pct?: number | null;
  letter: string;
};

export type M1Measurement = {
  id: string;
  createdAt: string;
  updatedAt: string;
  reference: string;
  programFolder: string;
  partBase: string;
  partLabel: string;
  machine: {
    cms: string;
    gauge: string;
    label: string;
    syntechMaquina: number | null;
  };
  swatch: {
    widthCm: number;
    heightCm: number;
    fabricState: 'raw';
  };
  programCounts: {
    wales: number;
    courses: number;
    source: string;
  };
  density: {
    walesPer10cm: number;
    coursesPer10cm: number;
  };
  regulation: {
    primarySource: 'setx' | 'sin';
    sinNps: { np: number; value: number; label: string }[];
    setxNps: { np: number; value: number; comment: string }[];
    ydf?: number;
    ygc?: string;
    mseci?: number;
  };
  stitchTypeId?: string;
  stitchTypeCode?: string;
  yarns: M1MeasurementYarn[];
  files: {
    sin?: string;
    setx?: string;
  };
  notes?: string;
};

export type M1KnowledgeFile = {
  version: number;
  stitchTypes: M1StitchType[];
  measurements: M1Measurement[];
};

function defaultKnowledge(): M1KnowledgeFile {
  return {
    version: 2,
    stitchTypes: [
      { id: 'mm-frente', code: 'M.M', name: 'Meia malha frente' },
      { id: 'canelado-2x2', code: '2x2', name: 'Canelado 2x2' },
      { id: 'jersey', code: 'jersey', name: 'Jersey (direito simples)' },
    ],
    measurements: [],
  };
}

export function readM1Knowledge(): M1KnowledgeFile {
  if (!fs.existsSync(m1KnowledgePath)) {
    const initial = defaultKnowledge();
    writeM1Knowledge(initial);
    return initial;
  }

  const parsed = JSON.parse(fs.readFileSync(m1KnowledgePath, 'utf8')) as M1KnowledgeFile;
  return {
    version: parsed.version ?? 2,
    stitchTypes: Array.isArray(parsed.stitchTypes) ? parsed.stitchTypes : defaultKnowledge().stitchTypes,
    measurements: Array.isArray(parsed.measurements) ? parsed.measurements : [],
  };
}

export function writeM1Knowledge(data: M1KnowledgeFile) {
  fs.writeFileSync(m1KnowledgePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function computeDensity(wales: number, courses: number, widthCm: number, heightCm: number) {
  if (!(widthCm > 0) || !(heightCm > 0)) {
    throw new Error('Informe largura e altura em cm maiores que zero.');
  }
  return {
    walesPer10cm: (wales / widthCm) * 10,
    coursesPer10cm: (courses / heightCm) * 10,
  };
}

export function addM1Measurement(input: Omit<M1Measurement, 'id' | 'createdAt' | 'updatedAt'>) {
  const lib = readM1Knowledge();
  const now = new Date().toISOString();
  const row: M1Measurement = {
    ...input,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  lib.measurements.push(row);
  writeM1Knowledge(lib);
  return row;
}

export type M1SimilarQuery = {
  syntechCod?: number | null;
  sinDescriptionKey?: string;
  cms?: string;
  gauge?: string;
  stitchTypeCode?: string;
  excludeId?: string;
  limit?: number;
};

export function findSimilarMeasurements(query: M1SimilarQuery): M1Measurement[] {
  const lib = readM1Knowledge();
  const limit = query.limit ?? 12;
  const scored: { row: M1Measurement; score: number }[] = [];

  for (const row of lib.measurements) {
    if (query.excludeId && row.id === query.excludeId) continue;

    let score = 0;
    const yarnCodes = row.yarns.map((y) => y.syntechCod).filter((c): c is number => c != null);
    if (query.syntechCod != null && yarnCodes.includes(query.syntechCod)) score += 40;

    const yarnKeys = row.yarns.map((y) => y.sinDescriptionKey);
    if (query.sinDescriptionKey && yarnKeys.includes(query.sinDescriptionKey)) score += 25;

    if (query.cms && row.machine.cms === query.cms) score += 15;
    if (query.gauge && row.machine.gauge === query.gauge) score += 10;
    if (query.stitchTypeCode && row.stitchTypeCode === query.stitchTypeCode) score += 10;

    if (score > 0) scored.push({ row, score });
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.row.createdAt.localeCompare(a.row.createdAt);
  });

  return scored.slice(0, limit).map((item) => item.row);
}
