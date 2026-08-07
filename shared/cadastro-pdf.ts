import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  applyAutoYarnConsumption,
  consolidateYarnParts,
  formatConsumption,
  formatPct,
  parseConsumptionInput,
  type PartWeightRow,
  type YarnPartRow,
} from './yarn-consumption';

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
  if (consolidated.length > 0) {
    doc.setFontSize(11);
    doc.text('Fios consolidados (programa)', 14, yAfterParts);
    yAfterParts += 4;
    autoTable(doc, {
      startY: yAfterParts + 2,
      head: [['%', 'Consumo total', 'Bico', 'Fio', 'Descrição', 'Partes']],
      body: consolidated.map((row) => [
        formatPct(row.pct),
        row.consumption || '—',
        String(row.guide),
        row.letter,
        row.description || '—',
        row.parts.join(', '),
      ]),
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [18, 28, 46] },
      theme: 'grid',
    });
    yAfterParts = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? yAfterParts;
    yAfterParts += 8;
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
