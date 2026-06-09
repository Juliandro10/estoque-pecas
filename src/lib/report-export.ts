import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { Movement, Part, Shift, StockReport } from '../types';
import { SHIFT_LABELS } from '../types';

function formatDate(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function statusLabel(status?: string) {
  if (status === 'zerado') return 'Zerado';
  if (status === 'baixo') return 'Baixo';
  return 'OK';
}

function fileStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
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

function partLines(parts: Part[]) {
  return parts.map(
    (p) =>
      `${p.code.padEnd(12)} | ${p.name.padEnd(36)} | ${String(p.quantity).padStart(4)} ${p.unit} | ${statusLabel(p.status)}`
  );
}

function withdrawalLines(rows: Movement[], shift?: Shift) {
  const filtered = shift ? rows.filter((r) => r.shift === shift) : rows;
  return filtered.map(
    (w) =>
      `${formatDate(w.created_at)} | ${(w.part_code ?? '').padEnd(10)} | ${String(w.quantity).padStart(3)} | ${w.shift ? SHIFT_LABELS[w.shift].padEnd(5) : '—    '} | ${(w.withdrawn_by ?? '—').padEnd(16)} | ${(w.requested_by ?? '—').padEnd(16)} | ${w.notes ?? '—'}`
  );
}

export function exportReportTxt(report: StockReport, filter: 'all' | 'baixo' | 'zerado') {
  const parts =
    filter === 'baixo'
      ? report.lowStockParts
      : filter === 'zerado'
        ? report.outOfStockParts
        : report.parts;

  const title =
    filter === 'baixo'
      ? 'RELATÓRIO — ESTOQUE BAIXO'
      : filter === 'zerado'
        ? 'RELATÓRIO — ESTOQUE ZERADO'
        : 'RELATÓRIO — ESTOQUE DE PEÇAS';

  const lines = [
    title,
    `Gerado em: ${formatDate(report.generated_at)}`,
    '',
    `Itens com estoque baixo: ${report.low_stock}`,
    `Itens zerados: ${report.out_of_stock}`,
    '',
    'CÓDIGO       | NOME                                 | QTD    | STATUS',
    '-'.repeat(72),
    ...partLines(parts),
  ];

  const suffix = filter === 'all' ? 'completo' : filter;
  downloadText(`estoque-${suffix}-${fileStamp()}.txt`, lines.join('\n'));
}

export function exportReportPdf(report: StockReport, filter: 'all' | 'baixo' | 'zerado') {
  const parts =
    filter === 'baixo'
      ? report.lowStockParts
      : filter === 'zerado'
        ? report.outOfStockParts
        : report.parts;

  const title =
    filter === 'baixo'
      ? 'Estoque baixo'
      : filter === 'zerado'
        ? 'Estoque zerado'
        : 'Estoque de peças';

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text(`Relatório — ${title}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Gerado em: ${formatDate(report.generated_at)}`, 14, 26);
  doc.text(
    `Itens com estoque baixo: ${report.low_stock} | Itens zerados: ${report.out_of_stock}`,
    14,
    32
  );
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 38,
    head: [['Código', 'Peça', 'Qtd', 'Status']],
    body: parts.map((p) => [
      p.code,
      p.name,
      `${p.quantity} ${p.unit}`,
      statusLabel(p.status),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [18, 28, 46] },
    alternateRowStyles: { fillColor: [245, 247, 250] },
  });

  const suffix = filter === 'all' ? 'completo' : filter;
  doc.save(`estoque-${suffix}-${fileStamp()}.pdf`);
}

export function exportWithdrawalsTxt(report: StockReport, shift?: Shift) {
  const rows = report.recentWithdrawals;
  const title = shift ? `RELATÓRIO — RETIRADAS (${SHIFT_LABELS[shift].toUpperCase()})` : 'RELATÓRIO — RETIRADAS';

  const lines = [
    title,
    `Gerado em: ${formatDate(report.generated_at)}`,
    `Total de registros: ${shift ? rows.filter((r) => r.shift === shift).length : rows.length}`,
    '',
    'DATA                 | CÓDIGO     | QTD | TURNO | RETIROU          | SOLICITOU        | OBS',
    '-'.repeat(110),
    ...withdrawalLines(rows, shift),
  ];

  const suffix = shift ?? 'todos';
  downloadText(`retiradas-${suffix}-${fileStamp()}.txt`, lines.join('\n'));
}

export function exportWithdrawalsPdf(report: StockReport, shift?: Shift) {
  const rows = shift ? report.recentWithdrawals.filter((r) => r.shift === shift) : report.recentWithdrawals;
  const title = shift ? `Retiradas — ${SHIFT_LABELS[shift]}` : 'Retiradas';

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.text(`Relatório — ${title}`, 14, 18);
  doc.setFontSize(10);
  doc.setTextColor(80);
  doc.text(`Gerado em: ${formatDate(report.generated_at)} · ${rows.length} registros`, 14, 26);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 32,
    head: [['Data', 'Peça', 'Qtd', 'Turno', 'Retirou', 'Solicitou', 'Obs']],
    body: rows.map((w) => [
      formatDate(w.created_at),
      `${w.part_code} — ${w.part_name}`,
      String(w.quantity),
      w.shift ? SHIFT_LABELS[w.shift] : '—',
      w.withdrawn_by ?? '—',
      w.requested_by ?? '—',
      w.notes ?? '—',
    ]),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [18, 28, 46] },
    columnStyles: { 6: { cellWidth: 50 } },
  });

  const suffix = shift ?? 'todos';
  doc.save(`retiradas-${suffix}-${fileStamp()}.pdf`);
}
