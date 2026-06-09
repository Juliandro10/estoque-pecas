import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { MonthlyReport } from '../types';
import { SHIFT_LABELS } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function fileStamp(month: string) {
  return month.replace('-', '');
}

function downloadText(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function shiftSummaryLines(report: MonthlyReport) {
  return report.by_shift.map(
    (s) =>
      `${SHIFT_LABELS[s.shift].padEnd(6)} | ${String(s.total_qty).padStart(5)} peças | ${s.records} retiradas`
  );
}

export function exportReplenishmentTxt(report: MonthlyReport) {
  const lines = [
    'RELATÓRIO DE REPOSIÇÃO',
    `Período: ${report.period_label}`,
    `Gerado em: ${formatDate(report.generated_at)}`,
    'Destino: Departamento de Compras',
    '',
    `TOTAL GERAL A REPOR: ${report.total_withdrawn} peças (${report.total_records} retiradas)`,
    '',
    '--- QUANTIDADE POR PEÇA ---',
    'CÓDIGO       | PEÇA                                 | TOTAL | CEDO | TARDE | NOITE | UN',
    '-'.repeat(95),
    ...report.by_part.map(
      (p) =>
        `${p.part_code.padEnd(12)} | ${p.part_name.padEnd(36)} | ${String(p.total_qty).padStart(5)} | ${String(p.by_shift.cedo).padStart(4)} | ${String(p.by_shift.tarde).padStart(5)} | ${String(p.by_shift.noite).padStart(5)} | ${p.unit}`
    ),
    '',
    '--- TOTAL POR TURNO ---',
    ...shiftSummaryLines(report),
  ];

  downloadText(`reposicao-${fileStamp(report.month)}.txt`, lines.join('\n'));
}

export function exportReplenishmentPdf(report: MonthlyReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Relatório de Reposição', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Período: ${report.period_label}`, 14, 26);
  doc.text('Departamento de Compras', 14, 32);
  doc.text(
    `Total a repor: ${report.total_withdrawn} peças · ${report.total_records} retiradas`,
    14,
    38
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 44,
    head: [['Código', 'Peça', 'Total', 'Cedo', 'Tarde', 'Noite', 'Un.']],
    body: report.by_part.map((p) => [
      p.part_code,
      p.part_name,
      String(p.total_qty),
      String(p.by_shift.cedo),
      String(p.by_shift.tarde),
      String(p.by_shift.noite),
      p.unit,
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  const finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 44;

  doc.setFontSize(12);
  doc.text('Total por turno', 14, finalY + 12);
  autoTable(doc, {
    startY: finalY + 16,
    head: [['Turno', 'Peças retiradas', 'Nº retiradas']],
    body: report.by_shift.map((s) => [
      SHIFT_LABELS[s.shift],
      String(s.total_qty),
      String(s.records),
    ]),
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  doc.save(`reposicao-${fileStamp(report.month)}.pdf`);
}

export function exportAnalysisTxt(report: MonthlyReport) {
  const peak = report.peak_shift ? SHIFT_LABELS[report.peak_shift] : '—';

  const lines = [
    'RELATÓRIO DE ANÁLISE DE QUEBRAS',
    `Período: ${report.period_label}`,
    `Gerado em: ${formatDate(report.generated_at)}`,
    'Destino: Avaliação de consumo e horários',
    '',
    `TOTAL DE PEÇAS QUE SAÍRAM: ${report.total_withdrawn}`,
    `TURNO COM MAIS RETIRADAS: ${peak}`,
    '',
    '--- POR TURNO (detalhado) ---',
    ...report.by_shift.flatMap((s) => [
      `${SHIFT_LABELS[s.shift]} — ${s.total_qty} peças (${s.records} retiradas)`,
      ...s.parts.map((p) => `  · ${p.part_code} ${p.part_name}: ${p.total_qty}`),
      '',
    ]),
    '--- POR FUNCIONÁRIO (quem retirou) ---',
    ...report.by_withdrawn_by.map(
      (e) =>
        `${e.name.padEnd(20)} | total ${String(e.total_qty).padStart(4)} | cedo ${e.by_shift.cedo} | tarde ${e.by_shift.tarde} | noite ${e.by_shift.noite} | ${e.records} retiradas`
    ),
    '',
    '--- POR FUNCIONÁRIO (quem solicitou) ---',
    ...report.by_requested_by.map(
      (e) =>
        `${e.name.padEnd(20)} | total ${String(e.total_qty).padStart(4)} | cedo ${e.by_shift.cedo} | tarde ${e.by_shift.tarde} | noite ${e.by_shift.noite} | ${e.records} retiradas`
    ),
    '',
    '--- RANKING DE PEÇAS ---',
    ...report.by_part.map((p, i) => `${i + 1}. ${p.part_code} ${p.part_name}: ${p.total_qty}`),
  ];

  downloadText(`analise-quebras-${fileStamp(report.month)}.txt`, lines.join('\n'));
}

export function exportAnalysisPdf(report: MonthlyReport) {
  const peak = report.peak_shift ? SHIFT_LABELS[report.peak_shift] : '—';
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text('Relatório de Análise de Quebras', 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Período: ${report.period_label}`, 14, 26);
  doc.text('Avaliação de consumo e horários', 14, 32);
  doc.text(`Total que saiu: ${report.total_withdrawn} peças`, 14, 38);
  doc.text(`Turno com mais retiradas: ${peak}`, 14, 44);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 50,
    head: [['Turno', 'Peças', 'Retiradas', 'Principais peças']],
    body: report.by_shift.map((s) => [
      SHIFT_LABELS[s.shift],
      String(s.total_qty),
      String(s.records),
      s.parts
        .slice(0, 3)
        .map((p) => `${p.part_code} (${p.total_qty})`)
        .join(', ') || '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  let finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 50;

  doc.setFontSize(12);
  doc.text('Quem retirou', 14, finalY + 12);
  autoTable(doc, {
    startY: finalY + 16,
    head: [['Funcionário', 'Total', 'Cedo', 'Tarde', 'Noite', 'Retiradas']],
    body: report.by_withdrawn_by.map((e) => [
      e.name,
      String(e.total_qty),
      String(e.by_shift.cedo),
      String(e.by_shift.tarde),
      String(e.by_shift.noite),
      String(e.records),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY;

  if (finalY > 240) {
    doc.addPage();
    finalY = 20;
  }

  doc.setFontSize(12);
  doc.text('Quem solicitou', 14, finalY + 12);
  autoTable(doc, {
    startY: finalY + 16,
    head: [['Funcionário', 'Total', 'Cedo', 'Tarde', 'Noite', 'Retiradas']],
    body: report.by_requested_by.map((e) => [
      e.name,
      String(e.total_qty),
      String(e.by_shift.cedo),
      String(e.by_shift.tarde),
      String(e.by_shift.noite),
      String(e.records),
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  finalY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? finalY;

  if (finalY > 230) {
    doc.addPage();
    finalY = 20;
  }

  doc.setFontSize(12);
  doc.text('Ranking de peças', 14, finalY + 12);
  autoTable(doc, {
    startY: finalY + 16,
    head: [['#', 'Código', 'Peça', 'Total']],
    body: report.by_part.map((p, i) => [String(i + 1), p.part_code, p.part_name, String(p.total_qty)]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
  });

  doc.save(`analise-quebras-${fileStamp(report.month)}.pdf`);
}
