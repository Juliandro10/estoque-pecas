import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { ProgramMonthlyReport, ProgramReportTotalScope } from '../types-programming';
import { formatJobKindLabel } from '../types-programming';

function formatBr(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatGenerated(iso: string) {
  return new Date(iso).toLocaleString('pt-BR');
}

function totalScopeLabel(scope: ProgramReportTotalScope = 'month') {
  switch (scope) {
    case 'day':
      return 'Total do dia';
    case 'week':
      return 'Total da semana';
    case 'period':
      return 'Total do período';
    default:
      return 'Total do mês';
  }
}

function drawPaidStamp(doc: jsPDF, x: number, y: number, w: number, h: number) {
  if (h < 12) return;

  doc.saveGraphicsState();
  doc.setDrawColor(200, 40, 40);
  doc.setTextColor(200, 40, 40);
  doc.setLineWidth(1.1);

  const padX = 6;
  const padY = 2;
  doc.rect(x + padX, y + padY, w - padX * 2, h - padY * 2);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(Math.min(34, Math.max(22, h * 0.28)));
  doc.text('PAGO', x + w / 2, y + h / 2 + 2, { align: 'center', angle: 22 });

  doc.restoreGraphicsState();
  doc.setTextColor(0);
  doc.setFont('helvetica', 'normal');
}

export function exportProgrammingPdf(
  report: ProgramMonthlyReport,
  options?: { fileTag?: string }
) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 16;
  const isExtra = report.work_type === 'extra';
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - 28;

  doc.setFontSize(16);
  const titleClient = report.client_name ? ` — ${report.client_name}` : '';
  doc.text(
    isExtra ? `Planilha de Programação — Extra${titleClient}` : 'Planilha de Programação — Dia normal',
    14,
    y
  );
  y += 7;
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(report.client_name?.trim() || 'TRICOT & CIA', 14, y);
  y += 5;
  doc.text(`Período: ${report.period_label}`, 14, y);
  y += 4;
  doc.text(`Gerado em: ${formatGenerated(report.generated_at)}`, 14, y);
  doc.setTextColor(0);
  y += 6;

  for (const week of report.weeks) {
    if (y > 265) {
      doc.addPage();
      y = 16;
    }

    const weekTopY = y;

    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(week.label, 14, y);
    doc.setFont('helvetica', 'normal');
    y += 2;

    autoTable(doc, {
      startY: y + 1,
      head: isExtra
        ? [
            ['Referência', 'Descrição', ...(report.client_name ? [] : ['Cliente']), 'Tipo', 'Data início', 'Data término', 'Valor'],
          ]
        : [['Referência', 'Descrição', 'Tipo', 'Data início', 'Data término']],
      body: week.entries.map((e) =>
        isExtra
          ? [
              e.reference,
              e.name,
              ...(report.client_name ? [] : [e.client_name]),
              formatJobKindLabel(e.job_kind, e.job_kind_note),
              formatBr(e.start_date),
              formatBr(e.end_date),
              e.paid ? `${formatMoney(e.value)} ✓` : formatMoney(e.value),
            ]
          : [
              e.reference,
              e.name,
              formatJobKindLabel(e.job_kind, e.job_kind_note),
              formatBr(e.start_date),
              formatBr(e.end_date),
            ]
      ),
      foot: isExtra
        ? [
            [
              '',
              '',
              ...(report.client_name ? [] : ['']),
              '',
              '',
              week.all_paid ? 'Total (pago)' : 'Total',
              formatMoney(week.subtotal),
            ],
          ]
        : [['', '', '', '', `${week.entries.length} programas`]],
      styles: { fontSize: 8.5, cellPadding: 1.4 },
      headStyles: { fillColor: [18, 28, 46], fontSize: 8.5 },
      footStyles: { fillColor: [240, 244, 248], textColor: [0, 0, 0], fontStyle: 'bold' },
      theme: 'grid',
      margin: { left: 14, right: 14 },
    });

    const tableEndY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;

    if (isExtra && week.all_paid) {
      drawPaidStamp(doc, 14, weekTopY - 1, contentWidth, tableEndY - weekTopY + 3);
    }

    y = tableEndY + 4;
  }

  if (y > 255) {
    doc.addPage();
    y = 16;
  }

  doc.setFontSize(12);
  const totalLabel = totalScopeLabel(report.total_scope);
  if (isExtra) {
    y += 4;
    doc.setFont('helvetica', 'bold');
    doc.text(
      `${totalLabel}: ${report.total_programs} programas — R$ ${formatMoney(report.total_value)}`,
      14,
      y
    );
    y += 6;
    doc.setTextColor(200, 40, 40);
    doc.text(
      `Pago: ${report.paid_programs} programas — R$ ${formatMoney(report.paid_value)}`,
      14,
      y
    );
    y += 6;
    doc.setTextColor(0);
    doc.text(
      `A pagar: ${report.pending_programs} programas — R$ ${formatMoney(report.pending_value)}`,
      14,
      y
    );
    doc.setFont('helvetica', 'normal');
  } else {
    doc.text(`${totalLabel}: ${report.total_programs} programas`, 14, y + 4);
  }

  const fileTag = options?.fileTag ?? report.month;
  doc.save(
    `${isExtra ? 'extra' : 'dia-normal'}${report.client_name ? `-${report.client_name.replace(/[^\w.-]+/g, '_')}` : ''}-${fileTag}.pdf`
  );
}
