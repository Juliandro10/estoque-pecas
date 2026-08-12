import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

import {
  DADOS_PROGRAMA_DIR,
  findModelFolderForPartInRoots,
  sintralPartDir,
} from './sintral-capture';

const execFileAsync = promisify(execFile);

export type SintralSimulationStats = {
  cursos?: number;
  cursos_vazio?: number;
  fileiras_tricotagem?: number;
  fileiras_transferencia?: number;
  fileiras_split?: number;
  fileiras_vazio?: number;
  fileiras_wkt?: number;
  rendimento_sistema_pct?: number;
};

export type SintralScreenCapture = {
  part_base: string;
  time_mmss: string;
  seconds: number;
  time_label?: string;
  mdv_file?: string;
  status?: string;
  simulation?: SintralSimulationStats;
  raw_text: string;
  raw_lines: string[];
  window_title?: string;
  captured_at: string;
  source: 'controle-sintral';
};

export type SintralScreenEvent = {
  part_base: string;
  dest_file: string;
  capture: SintralScreenCapture;
};

export const SCREEN_FILE = 'controle-sintral.json';
export const SCREEN_TEXT_FILE = 'controle-sintral.txt';

const PS_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'sintral-read-window.ps1');

let lastEvents: SintralScreenEvent[] = [];
let lastSavedKey = new Map<string, string>();
let pollTimer: ReturnType<typeof setInterval> | null = null;

function formatMmSs(totalSec: number) {
  const rounded = Math.max(0, Math.round(totalSec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function normalizeSintralLine(line: string) {
  const idx = line.indexOf(' :: ');
  return idx >= 0 ? line.slice(idx + 4).trim() : line.trim();
}

function joinedText(lines: string[]) {
  return lines.map(normalizeSintralLine).join('\n');
}

export function parsePartBaseFromSintralText(text: string) {
  const loadSin = text.match(/load\s+[^\s]*[/\\]([A-Za-z0-9][A-Za-z0-9\-_.]*)\.sin\b/i)?.[1];
  if (loadSin) return loadSin.replace(/[^A-Za-z0-9\-_.]/g, '');

  const tmpSin = text.match(/[/\\]([A-Za-z0-9][A-Za-z0-9\-_.]*)\.sin\b/i)?.[1];
  if (tmpSin) return tmpSin.replace(/[^A-Za-z0-9\-_.]/g, '');

  const mdv =
    text.match(/([A-Za-z0-9][A-Za-z0-9\-_.]*)\.mdv\b/i)?.[1] ??
    text.match(/CMS\d+\.([A-Za-z0-9\-_.]+)/i)?.[1];
  if (!mdv) return null;
  return mdv.replace(/\.mdv$/i, '').replace(/[^A-Za-z0-9\-_.]/g, '');
}

export function parseKnittingTimeFromSintralText(text: string) {
  const matches = [
    ...text.matchAll(
      /Tempo\s+de\s+tricotagem\s+calculado\s*:?\s*(\d+)\s*min\s*(\d+)\s*sec/gi
    ),
    ...text.matchAll(/Tempo\s+de\s+tricotagem\s*:?\s*(\d+)\s*min\s*(\d+)\s*sec/gi),
  ];
  const hit = matches.at(-1);
  if (hit) {
    const seconds = Number(hit[1]) * 60 + Number(hit[2]);
    return {
      seconds,
      time_mmss: formatMmSs(seconds),
      time_label: `${hit[1]} min ${hit[2]} sec`,
    };
  }

  const minSec = [...text.matchAll(/(\d+)\s*min\s*(\d+)\s*sec/gi)].at(-1);
  if (minSec) {
    const seconds = Number(minSec[1]) * 60 + Number(minSec[2]);
    return {
      seconds,
      time_mmss: formatMmSs(seconds),
      time_label: `${minSec[1]} min ${minSec[2]} sec`,
    };
  }

  return null;
}

function parseIntField(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*:?\\s*(\\d+)`, 'i'));
  return match ? Number(match[1]) : undefined;
}

function parsePctField(text: string, label: string) {
  const match = text.match(new RegExp(`${label}\\s*:?\\s*(\\d+)\\s*%`, 'i'));
  return match ? Number(match[1]) : undefined;
}

export function parseSimulationStatsFromSintralText(text: string): SintralSimulationStats | undefined {
  if (!/START SIMULATION/i.test(text)) return undefined;

  const stats: SintralSimulationStats = {
    cursos: parseIntField(text, 'Cursos'),
    cursos_vazio: parseIntField(text, 'Cursos em vazio'),
    fileiras_tricotagem: parseIntField(text, 'Fileiras de tricotagem'),
    fileiras_transferencia: parseIntField(text, 'Fileiras de transfer'),
    fileiras_split: parseIntField(text, 'Fileiras de split'),
    fileiras_vazio: parseIntField(text, 'Fileiras em vazio'),
    fileiras_wkt: parseIntField(text, 'Fileiras WKT'),
    rendimento_sistema_pct: parsePctField(text, 'Rendimento sistema'),
  };

  return Object.values(stats).some((v) => v !== undefined) ? stats : undefined;
}

function parseStatus(text: string) {
  if (/Simula\w+\s+OK/i.test(text)) return 'Simulação OK';
  if (/Sintaxe\s+OK/i.test(text)) return 'Sintaxe OK';
  if (/Sintral\s+Check\s+OK/i.test(text)) return 'Sintral Check OK';
  return undefined;
}

function filterLogLines(raw_lines: string[]) {
  const rich = raw_lines.filter((line) => /^richedit20w\s*::/i.test(line));
  const richText = joinedText(rich);
  if (
    rich.length > 0 &&
    (/Tempo\s+de\s+tricotagem/i.test(richText) ||
      /START SIMULATION/i.test(richText) ||
      /\.sin\b/i.test(richText))
  ) {
    return rich;
  }
  return raw_lines;
}

export function parseSintralWindowPayload(payload: {
  running?: boolean;
  lines?: string[];
  title?: string;
}): SintralScreenCapture | null {
  if (!payload.running || !payload.lines?.length) return null;

  const raw_lines = payload.lines.map(String);
  const log_lines = filterLogLines(raw_lines);
  const raw_text = joinedText(log_lines);
  if (!/Tempo\s+de\s+tricotagem/i.test(raw_text)) return null;

  const time = parseKnittingTimeFromSintralText(raw_text);
  if (!time || time.seconds <= 0) return null;

  const part_base = parsePartBaseFromSintralText(raw_text);
  if (!part_base) return null;

  const mdv_file = `${part_base}.mdv`;

  return {
    part_base,
    time_mmss: time.time_mmss,
    seconds: time.seconds,
    time_label: time.time_label,
    mdv_file,
    status: parseStatus(raw_text),
    simulation: parseSimulationStatsFromSintralText(raw_text),
    raw_text,
    raw_lines: log_lines,
    window_title: payload.title,
    captured_at: new Date().toISOString(),
    source: 'controle-sintral',
  };
}

async function readSintralWindowRaw() {
  if (!fs.existsSync(PS_SCRIPT)) {
    return { running: false as const, lines: [] as string[], title: '' };
  }

  try {
    const { stdout } = await execFileAsync(
      'powershell',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PS_SCRIPT],
      { timeout: 20_000, maxBuffer: 8 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout.trim() || '{}') as {
      running?: boolean;
      lines?: string[];
      title?: string;
    };
    return parsed;
  } catch {
    return { running: false as const, lines: [] as string[], title: '' };
  }
}

function saveCapture(capture: SintralScreenCapture) {
  const modelFolder = findModelFolderForPartInRoots(capture.part_base);
  if (!modelFolder) return null;

  const partDir = sintralPartDir(modelFolder, capture.part_base);
  fs.mkdirSync(partDir, { recursive: true });

  const destFile = path.join(partDir, SCREEN_FILE);
  const payload = `${JSON.stringify(capture, null, 2)}\n`;

  if (fs.existsSync(destFile)) {
    try {
      const prev = JSON.parse(fs.readFileSync(destFile, 'utf8')) as SintralScreenCapture;
      if (prev.raw_text === capture.raw_text && prev.seconds === capture.seconds) {
        return {
          part_base: capture.part_base,
          dest_file: destFile,
          capture: prev,
        };
      }
    } catch {
      // sobrescreve arquivo corrompido
    }
  }

  fs.writeFileSync(destFile, payload, 'utf8');
  fs.writeFileSync(path.join(partDir, SCREEN_TEXT_FILE), `${capture.raw_text}\n`, 'utf8');

  const event: SintralScreenEvent = {
    part_base: capture.part_base,
    dest_file: destFile,
    capture,
  };
  lastEvents = [event, ...lastEvents].slice(0, 30);
  return event;
}

export async function scanSintralScreen(_programsRoot?: string) {
  const raw = await readSintralWindowRaw();
  const capture = parseSintralWindowPayload(raw);
  if (!capture) {
    return { running: Boolean(raw.running), captured: false, capture: null as SintralScreenCapture | null };
  }

  const key = `${capture.part_base}|${capture.seconds}|${capture.raw_text.length}`;
  const event = saveCapture(capture);
  if (event) lastSavedKey.set(capture.part_base, key);

  return { running: true, captured: Boolean(event), capture, event };
}

export function readControleSintralFile(partDir: string): SintralScreenCapture | null {
  const filePath = path.join(partDir, SCREEN_FILE);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8')) as SintralScreenCapture;
    if (data.seconds > 0 && data.time_mmss) return data;
  } catch {
    // ignore
  }
  return null;
}

export function readControleSintralForPart(modelFolder: string, partBase: string) {
  return readControleSintralFile(sintralPartDir(modelFolder, partBase));
}

export type SintralTimePartRow = {
  label: string;
  file_name: string;
  ok: boolean;
  time_mmss?: string;
  captured_at?: string;
  error?: string;
};

function partBaseFromMdv(fileName: string) {
  return fileName.replace(/\.mdv$/i, '').trim();
}

export function readSintralTimesForModel(
  modelFolder: string,
  parts: { label: string; file_name: string }[]
): SintralTimePartRow[] {
  return parts.map((part) => {
    if (!part.file_name) {
      return { label: part.label, file_name: part.file_name, ok: false, error: 'Sem arquivo .mdv' };
    }
    if (!/\.mdv$/i.test(part.file_name)) {
      return { label: part.label, file_name: part.file_name, ok: false, error: 'Não é .mdv' };
    }

    const partBase = partBaseFromMdv(part.file_name);
    const tela = readControleSintralForPart(modelFolder, partBase);
    if (tela?.seconds && tela.time_mmss) {
      return {
        label: part.label,
        file_name: part.file_name,
        ok: true,
        time_mmss: tela.time_mmss,
        captured_at: tela.captured_at,
      };
    }

    return {
      label: part.label,
      file_name: part.file_name,
      ok: false,
      error: 'Sem controle-sintral.json — rode o cheque com Iniciar.bat aberto',
    };
  });
}

export function getSintralScreenStatus() {
  return {
    script: PS_SCRIPT,
    recent: lastEvents.slice(0, 10),
  };
}

export function startSintralScreenWatcher(_programsRoot?: string, intervalMs = 1500) {
  if (pollTimer) return;
  void scanSintralScreen();
  pollTimer = setInterval(() => {
    void scanSintralScreen().catch(() => {
      // Controle Sintral pode estar fechando
    });
  }, intervalMs);
}

export { DADOS_PROGRAMA_DIR };
