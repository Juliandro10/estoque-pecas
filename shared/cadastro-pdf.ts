import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  applyAutoYarnConsumption,
  consolidateYarnParts,
  formatConsumption,
  formatPct,
  normalizeYarnDescriptionKey,
  parseConsumptionInput,
  type PartWeightRow,
  type YarnPartRow,
} from './yarn-consumption';
import { expandProcessYarnComponents, type ProcessYarnComponent } from './yarn-blend-core';
import { bicoProcessoLabel } from './guia-fio-text';

export type CadastroPdfPart = PartWeightRow & { time_mmss?: string };

export type CadastroPdfInput = {
  reference: string;
  name: string;
  parts: CadastroPdfPart[];
  yarn_parts: YarnPartRow[];
  observations: string;
  updated_at: string;
  /** Ex.: CMS502 — do cabeçalho .sin / Sintral */
  machine_cms?: string;
  /** Ex.: E6.2 */
  machine_gauge?: string;
  /** Ex.: CMS 502 E6.2 — usado se cms/gauge não vierem separados */
  machine_label?: string;
  /** Tipos do catálogo Syntech — sem isso a lantejoula vira "FIO" e o PDF rateia 50/50. */
  yarn_types?: string[];
};

export type CadastroCustoView = {
  reference: string;
  name: string;
  company: string;
  machine_line: string;
  updated_at: string;
  updated_label: string;
  parts: { label: string; file_name: string; time: string; weight: string }[];
  parts_total_time: string;
  parts_total_weight: string;
  yarns: {
    pct: string;
    consumption: string;
    bico: string;
    letter: string;
    description: string;
    parts: string;
  }[];
  summary: { tipo: string; cor: string; peso: string; pct: string }[];
  summary_total_peso: string;
  summary_total_pct: string;
  observations: string;
};

function formatGenerated(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function parseTimeToSeconds(raw: string) {
  const text = raw.trim();
  const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!colon) return 0;
  if (colon[3]) return Number(colon[1]) * 3600 + Number(colon[2]) * 60 + Number(colon[3]);
  return Number(colon[1]) * 60 + Number(colon[2]);
}

function formatTotalTime(totalSec: number) {
  const rounded = Math.max(0, Math.round(totalSec));
  const m = Math.floor(rounded / 60);
  const s = rounded % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function totalPartsTime(parts: CadastroPdfInput['parts']) {
  return formatTotalTime(parts.reduce((sum, part) => sum + parseTimeToSeconds(part.time_mmss), 0));
}

function totalPartsWeight(parts: CadastroPdfInput['parts']) {
  const total = parts.reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
  return total > 0 ? formatConsumption(total) : '—';
}

function formatCmsForPdf(cms: string) {
  const match = cms.trim().toUpperCase().match(/^CMS(\d+)(\+?)$/);
  if (!match) return cms.trim();
  return `CMS ${match[1]}${match[2]}`;
}

function formatGaugeForPdf(gauge: string) {
  const normalized = gauge.trim().toUpperCase().replace(',', '.');
  const parts = normalized.split('.');
  if (parts.length === 3 && parts[0].startsWith('E')) {
    return `${parts[0]},${parts[1]}.${parts[2]}`;
  }
  return normalized;
}

/** Linha "Máquina: CMS 502 · Finura: E6.2" a partir do .sin / label da tela. */
export function formatMachinePdfLine(input: Pick<CadastroPdfInput, 'machine_cms' | 'machine_gauge' | 'machine_label'>) {
  const cms = input.machine_cms?.trim() ?? '';
  const gauge = input.machine_gauge?.trim() ?? '';
  if (cms && gauge) {
    return `Máquina: ${formatCmsForPdf(cms)} · Finura: ${formatGaugeForPdf(gauge)}`;
  }

  const label = input.machine_label?.trim() ?? '';
  if (!label) return '';

  const fromLabel = label.match(/^(CMS\s*\d+\+?)\s+(E[\d,.]+)$/i);
  if (fromLabel) {
    return `Máquina: ${formatCmsForPdf(fromLabel[1].replace(/\s+/g, ''))} · Finura: ${formatGaugeForPdf(fromLabel[2])}`;
  }

  return `Máquina: ${label}`;
}

export type YarnWeightSummaryRow = {
  tipo: string;
  cor: string;
  consumptionKg: number;
  pct: number;
};

function summaryTipoKey(tipo: string) {
  return normalizeYarnDescriptionKey(tipo.replace(/\bPOLISTER\b/gi, 'POLIESTER'));
}

function summaryCorKey(cor: string | null) {
  return normalizeYarnDescriptionKey(cor ?? '');
}

function isPricingWasteYarn(row: { guide?: number; tipo: string; description?: string }) {
  if (row.guide === 1 || row.guide === 2) return true;
  const text = `${row.tipo} ${row.description ?? ''}`.toUpperCase();
  if (/\bSEPARACAO\b|\bRESTO DE FIO\b/.test(text)) return true;
  if (/ELASTICO(?:\s+(?:DE\s+|DO\s+))?PENTE/.test(text)) return true;
  return false;
}

export function summarizeYarnWeightByTypeAndColor(
  rows: Pick<ProcessYarnComponent, 'tipo' | 'cor' | 'consumptionKg'> &
    Partial<Pick<ProcessYarnComponent, 'guide' | 'description'>>[],
  _partWeightKg = 0
): YarnWeightSummaryRow[] {
  const groups = new Map<string, YarnWeightSummaryRow>();

  for (const row of rows) {
    if (row.consumptionKg <= 0) continue;
    if (isPricingWasteYarn(row)) continue;
    const tipo = row.tipo.trim() || '—';
    const cor = row.cor?.trim() || '—';
    const tipoLabel =
      /LANTEJOU?LA|PAETE/i.test(`${tipo} ${row.description ?? ''}`) && !/LANTEJOU?LA|PAETE/i.test(tipo)
        ? 'FIO LANTEJOULA'
        : tipo;
    const key = `${summaryTipoKey(tipoLabel)}|${summaryCorKey(cor === '—' ? '' : cor)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.consumptionKg += row.consumptionKg;
      continue;
    }
    groups.set(key, { tipo: tipoLabel, cor, consumptionKg: row.consumptionKg, pct: 0 });
  }

  const basis = [...groups.values()].reduce((sum, row) => sum + row.consumptionKg, 0);

  return [...groups.values()]
    .map((row) => ({
      ...row,
      consumptionKg: Math.round(row.consumptionKg * 1000) / 1000,
      pct: basis > 0 ? (row.consumptionKg / basis) * 100 : 0,
    }))
    .sort((a, b) => b.consumptionKg - a.consumptionKg || a.tipo.localeCompare(b.tipo, 'pt-BR'));
}

export function buildCadastroCustoView(cadastro: CadastroPdfInput): CadastroCustoView {
  const yarnParts = applyAutoYarnConsumption(cadastro.yarn_parts, cadastro.parts);
  const consolidated = consolidateYarnParts(yarnParts, cadastro.parts);
  const partWeightKg = cadastro.parts.reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
  const expanded = expandProcessYarnComponents(
    consolidated.map((row) => ({
      guide: row.guide,
      letter: row.letter,
      description: row.description,
      consumption: row.consumption,
      pct: row.pct,
      side: row.side,
      parts: row.parts,
    })),
    partWeightKg > 0 ? { partWeightKg } : {},
    cadastro.yarn_types ?? []
  ).filter((row) => row.consumptionKg > 0);

  const siblings = expanded.map((row) => ({
    guide: row.guide,
    slot: row.slot,
    letter: row.letter,
    side: row.side,
    parts: row.parts,
    componentIndex: row.componentIndex,
  }));

  const yarns = expanded.map((row) => ({
    pct: formatPct(row.pct),
    consumption: formatConsumption(row.consumptionKg),
    bico: bicoProcessoLabel(
      {
        guide: row.guide,
        slot: row.slot,
        letter: row.letter,
        side: row.side,
        parts: row.parts,
        componentIndex: row.componentIndex,
      },
      siblings
    ),
    letter: row.letter ?? '',
    description: row.description || '—',
    parts: (row.parts ?? []).join(', '),
  }));

  const summaryRows = summarizeYarnWeightByTypeAndColor(expanded, partWeightKg);
  const summaryTotal = summaryRows.reduce((sum, row) => sum + row.consumptionKg, 0);

  return {
    reference: cadastro.reference.trim(),
    name: cadastro.name.trim(),
    company: 'TRICOT & CIA',
    machine_line: formatMachinePdfLine(cadastro),
    updated_at: cadastro.updated_at,
    updated_label: formatGenerated(cadastro.updated_at),
    parts: cadastro.parts.map((part) => ({
      label: part.label || '—',
      file_name: part.file_name || '—',
      time: part.time_mmss || '—',
      weight: part.weight_kg || '—',
    })),
    parts_total_time: totalPartsTime(cadastro.parts),
    parts_total_weight: totalPartsWeight(cadastro.parts),
    yarns,
    summary: summaryRows.map((row) => ({
      tipo: row.tipo,
      cor: row.cor,
      peso: formatConsumption(row.consumptionKg),
      pct: formatPct(row.pct),
    })),
    summary_total_peso: formatConsumption(summaryTotal),
    summary_total_pct: formatPct(summaryRows.reduce((sum, row) => sum + row.pct, 0) || (summaryRows.length ? 100 : 0)),
    observations: cadastro.observations.trim(),
  };
}

export function buildCadastroPdfBuffer(cadastro: CadastroPdfInput): Buffer {
  const view = buildCadastroCustoView(cadastro);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Ficha de Cadastro — Dados de Custo', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(view.company, 14, 26);
  doc.text(`Ref: ${view.reference} — ${view.name}`, 14, 32);

  let y = 38;
  if (view.machine_line) {
    doc.text(view.machine_line, 14, y);
    y += 6;
  }
  doc.text(`Atualizado: ${view.updated_label}`, 14, y);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 6,
    head: [['Parte', 'Arquivo', 'Tempo', 'Peso bruto (kg)']],
    body: view.parts.map((p) => [p.label, p.file_name, p.time, p.weight]),
    foot: [['Total', '', view.parts_total_time, view.parts_total_weight]],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 28, 46] },
    footStyles: { fillColor: [235, 238, 243], fontStyle: 'bold', textColor: [0, 0, 0] },
    theme: 'grid',
  });

  let yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 6;
  yAfterParts += 8;

  if (view.yarns.length > 0) {
    doc.setFontSize(11);
    doc.text('Fios consolidados (programa)', 14, yAfterParts);
    yAfterParts += 4;
    autoTable(doc, {
      startY: yAfterParts + 2,
      head: [['%', 'Consumo total', 'Bico', 'Fio', 'Descrição', 'Partes']],
      body: view.yarns.map((row) => [
        row.pct,
        row.consumption,
        row.bico,
        row.letter,
        row.description,
        row.parts,
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [18, 28, 46] },
      theme: 'grid',
    });
    yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yAfterParts;
    yAfterParts += 8;

    if (view.summary.length > 0) {
      doc.setFontSize(11);
      doc.text('Resumo para preço — peso por fio e cor', 14, yAfterParts);
      yAfterParts += 4;
      autoTable(doc, {
        startY: yAfterParts + 2,
        head: [['Fio', 'Cor', 'Peso (kg)', '%']],
        body: view.summary.map((row) => [row.tipo, row.cor, row.peso, row.pct]),
        foot: [['Total', '', view.summary_total_peso, view.summary_total_pct]],
        styles: { fontSize: 9, cellPadding: 2.5 },
        headStyles: { fillColor: [18, 28, 46] },
        footStyles: { fillColor: [235, 238, 243], fontStyle: 'bold', textColor: [0, 0, 0] },
        columnStyles: {
          2: { halign: 'right' },
          3: { halign: 'right' },
        },
        theme: 'grid',
      });
      yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yAfterParts;
      yAfterParts += 8;
    }
  }

  doc.setFontSize(10);
  if (view.observations) {
    doc.text(`Obs: ${view.observations}`, 14, yAfterParts);
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

export function cadastroPdfFileName(reference: string) {
  return `cadastro-${reference.trim()}.pdf`;
}
