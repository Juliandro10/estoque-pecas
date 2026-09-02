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

export type CadastroPdfInput = {
  reference: string;
  name: string;
  parts: PartWeightRow[];
  yarn_parts: YarnPartRow[];
  observations: string;
  updated_at: string;
  /** Ex.: CMS502 — do cabeçalho .sin / Sintral */
  machine_cms?: string;
  /** Ex.: E6.2 */
  machine_gauge?: string;
  /** Ex.: CMS 502 E6.2 — usado se cms/gauge não vierem separados */
  machine_label?: string;
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
    const key = `${summaryTipoKey(tipo)}|${summaryCorKey(cor === '—' ? '' : cor)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.consumptionKg += row.consumptionKg;
      continue;
    }
    groups.set(key, { tipo, cor, consumptionKg: row.consumptionKg, pct: 0 });
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

export function buildCadastroPdfBuffer(cadastro: CadastroPdfInput): Buffer {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Ficha de Cadastro — Dados de Custo', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text('TRICOT & CIA', 14, 26);
  doc.text(`Ref: ${cadastro.reference} — ${cadastro.name}`, 14, 32);

  let y = 38;
  const machineLine = formatMachinePdfLine(cadastro);
  if (machineLine) {
    doc.text(machineLine, 14, y);
    y += 6;
  }
  doc.text(`Atualizado: ${formatGenerated(cadastro.updated_at)}`, 14, y);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: y + 6,
    head: [['Parte', 'Arquivo', 'Tempo', 'Peso bruto (kg)']],
    body: cadastro.parts.map((p) => [p.label, p.file_name || '—', p.time_mmss || '—', p.weight_kg || '—']),
    foot: [['Total', '', totalPartsTime(cadastro.parts), totalPartsWeight(cadastro.parts)]],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 28, 46] },
    footStyles: { fillColor: [235, 238, 243], fontStyle: 'bold', textColor: [0, 0, 0] },
    theme: 'grid',
  });

  let yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 6;
  yAfterParts += 8;

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
    partWeightKg > 0 ? { partWeightKg } : {}
  ).filter((row) => row.consumptionKg > 0);

  if (expanded.length > 0) {
    const siblings = expanded.map((row) => ({
      guide: row.guide,
      slot: row.slot,
      letter: row.letter,
      side: row.side,
      parts: row.parts,
      componentIndex: row.componentIndex,
    }));
    doc.setFontSize(11);
    doc.text('Fios consolidados (programa)', 14, yAfterParts);
    yAfterParts += 4;
    autoTable(doc, {
      startY: yAfterParts + 2,
      head: [['%', 'Consumo total', 'Bico', 'Fio', 'Descrição', 'Partes']],
      body: expanded.map((row) => [
        formatPct(row.pct),
        formatConsumption(row.consumptionKg),
        bicoProcessoLabel(
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
        row.letter ?? '',
        row.description || '—',
        (row.parts ?? []).join(', '),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [18, 28, 46] },
      theme: 'grid',
    });
    yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yAfterParts;
    yAfterParts += 8;

    const summary = summarizeYarnWeightByTypeAndColor(expanded, partWeightKg);
    if (summary.length > 0) {
      const summaryTotal = summary.reduce((sum, row) => sum + row.consumptionKg, 0);
      doc.setFontSize(11);
      doc.text('Resumo para preço — peso por fio e cor', 14, yAfterParts);
      yAfterParts += 4;
      autoTable(doc, {
        startY: yAfterParts + 2,
        head: [['Fio', 'Cor', 'Peso (kg)', '%']],
        body: summary.map((row) => [
          row.tipo,
          row.cor,
          formatConsumption(row.consumptionKg),
          formatPct(row.pct),
        ]),
        foot: [
          [
            'Total',
            '',
            formatConsumption(summaryTotal),
            formatPct(summary.reduce((sum, row) => sum + row.pct, 0) || 100),
          ],
        ],
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
  if (cadastro.observations) {
    doc.text(`Obs: ${cadastro.observations}`, 14, yAfterParts);
  }

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
}

export function cadastroPdfFileName(reference: string) {
  return `cadastro-${reference.trim()}.pdf`;
}
