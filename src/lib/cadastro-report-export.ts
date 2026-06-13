import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { ModelCadastro } from '../types-programming';
import {
  applyAutoYarnConsumption,
  consolidateYarnParts,
  formatConsumption,
  formatPct,
  parseConsumptionInput,
} from './cadastro-db';

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

function totalPartsTime(parts: ModelCadastro['parts']) {
  return formatTotalTime(parts.reduce((sum, part) => sum + parseTimeToSeconds(part.time_mmss), 0));
}

function totalPartsWeight(parts: ModelCadastro['parts']) {
  const total = parts.reduce((sum, part) => sum + parseConsumptionInput(part.weight_kg), 0);
  return total > 0 ? formatConsumption(total) : '—';
}
export function exportCadastroPdf(cadastro: ModelCadastro) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Ficha de Cadastro — Dados de Custo', 14, 18);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text('TRICOT & CIA', 14, 26);
  doc.text(`Ref: ${cadastro.reference} — ${cadastro.name}`, 14, 32);
  doc.text(`Atualizado: ${formatGenerated(cadastro.updated_at)}`, 14, 38);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 44,
    head: [['Parte', 'Arquivo', 'Tempo', 'Peso bruto (kg)']],
    body: cadastro.parts.map((p) => [p.label, p.file_name || '—', p.time_mmss || '—', p.weight_kg || '—']),
    foot: [['Total', '', totalPartsTime(cadastro.parts), totalPartsWeight(cadastro.parts)]],
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 28, 46] },
    footStyles: { fillColor: [235, 238, 243], fontStyle: 'bold', textColor: [0, 0, 0] },
    theme: 'grid',
  });

  let y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 44;
  y += 8;

  const yarnParts = applyAutoYarnConsumption(cadastro.yarn_parts, cadastro.parts);
  const consolidated = consolidateYarnParts(yarnParts, cadastro.parts);
  if (consolidated.length > 0) {
    doc.setFontSize(11);
    doc.text('Fios consolidados (programa)', 14, y);
    y += 4;
    autoTable(doc, {
      startY: y + 2,
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
    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 8;
  }

  doc.setFontSize(10);
  if (cadastro.observations) {
    doc.text(`Obs: ${cadastro.observations}`, 14, y);
  }

  doc.save(`cadastro-${cadastro.reference}.pdf`);
}
