import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { ProgramMonthlyReport } from '../types-programming';
import { formatJobKindLabel, PROGRAM_VALUE } from '../types-programming';

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

export function exportProgrammingPdf(report: ProgramMonthlyReport) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  let y = 18;
  const isExtra = report.work_type === 'extra';

  doc.setFontSize(16);
  doc.text(
    isExtra ? 'Planilha de Programação — Extra' : 'Planilha de Programação — Dia normal',
    14,
    y
  );
  y += 8;
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text('TRICOT & CIA', 14, y);
  y += 6;
  doc.text(`Período: ${report.period_label}`, 14, y);
  y += 5;
  doc.text(`Gerado em: ${formatGenerated(report.generated_at)}`, 14, y);
  doc.setTextColor(0);
  y += 8;

  for (const week of report.weeks) {
    if (y > 250) {
      doc.addPage();
      y = 18;
    }

    doc.setFontSize(12);
    doc.text(week.label, 14, y);
    y += 4;

    autoTable(doc, {
      startY: y + 2,
      head: isExtra
        ? [['Referência', 'Descrição', 'Tipo', 'Data início', 'Data término', 'Valor']]
        : [['Referência', 'Descrição', 'Tipo', 'Data início', 'Data término']],
      body: week.entries.map((e) =>
        isExtra
          ? [
              e.reference,
              e.name,
              formatJobKindLabel(e.job_kind, e.job_kind_note),
              formatBr(e.start_date),
              formatBr(e.end_date),
              formatMoney(e.value),
            ]
          : [e.reference, e.name, formatJobKindLabel(e.job_kind, e.job_kind_note), formatBr(e.start_date), formatBr(e.end_date)]
      ),
      foot: isExtra
        ? [['', '', '', '', 'Total', formatMoney(week.subtotal)]]
        : [['', '', '', '', `${week.entries.length} programas`]],
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [18, 28, 46] },
      footStyles: { fillColor: [240, 244, 248], textColor: [0, 0, 0], fontStyle: 'bold' },
      theme: 'grid',
    });

    y = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y;
    y += 10;
  }

  if (y > 240) {
    doc.addPage();
    y = 18;
  }

  doc.setFontSize(13);
  if (isExtra) {
    doc.text(
      `Total do mês: ${report.total_programs} programas — R$ ${formatMoney(report.total_value)} (R$ ${formatMoney(PROGRAM_VALUE)} cada)`,
      14,
      y + 6
    );
  } else {
    doc.text(`Total do mês: ${report.total_programs} programas`, 14, y + 6);
  }

  doc.save(`${isExtra ? 'extra' : 'dia-normal'}-${report.month}.pdf`);
}
