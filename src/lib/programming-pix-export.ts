import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import QRCode from 'qrcode';

import type { ProgramMonthlyReport } from '../types-programming';
import { PIX_RECEIVER_LABEL, buildPixPayload, formatPixCpf, PIX_KEY } from './pix-brcode';

function formatBr(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export async function exportProgrammingPixPdf(
  report: ProgramMonthlyReport,
  options?: { fileTag?: string }
) {
  const entries = report.weeks.flatMap((week) => week.entries);
  if (entries.length === 0 || report.total_value <= 0) {
    throw new Error('Não há valor a pagar para gerar o PIX.');
  }

  const txid = (options?.fileTag ?? report.month).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const payload = buildPixPayload(report.total_value, txid);
  const qr = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 320,
  });

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 16;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text('Guia de pagamento PIX', 14, y);
  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(report.client_name?.trim() || 'TRICOT & CIA', 14, y);
  y += 5;
  doc.text(`Período: ${report.period_label}`, 14, y);
  y += 4;
  doc.text(`Recebedor: ${PIX_RECEIVER_LABEL}`, 14, y);
  doc.setTextColor(0);
  y += 6;

  autoTable(doc, {
    startY: y,
    head: [['Referência', 'Descrição', 'Valor']],
    body: entries.map((entry) => [entry.reference, entry.name, formatMoney(entry.value)]),
    foot: [['', `${entries.length} programa(s)`, formatMoney(report.total_value)]],
    styles: { fontSize: 9, cellPadding: 1.6 },
    headStyles: { fillColor: [18, 28, 46], fontSize: 9 },
    footStyles: { fillColor: [240, 244, 248], textColor: [0, 0, 0], fontStyle: 'bold' },
    theme: 'grid',
    margin: { left: 14, right: 14 },
  });

  y = ((doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y) + 8;
  if (y > 200) {
    doc.addPage();
    y = 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Total a pagar: R$ ${formatMoney(report.total_value)}`, 14, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Chave PIX (CPF): ${formatPixCpf(PIX_KEY)}`, 14, y);
  y += 5;
  doc.setTextColor(80);
  doc.text('Aponte a câmera do banco para o QR ou copie o código abaixo.', 14, y);
  doc.setTextColor(0);
  y += 4;

  const qrSize = 52;
  doc.addImage(qr, 'PNG', (pageWidth - qrSize) / 2, y, qrSize, qrSize);
  y += qrSize + 6;

  doc.setFontSize(8);
  const lines = doc.splitTextToSize(payload, pageWidth - 28);
  doc.text(lines, 14, y);

  const fileTag = options?.fileTag ?? report.month;
  const client = report.client_name ? `-${report.client_name.replace(/[^\w.-]+/g, '_')}` : '';
  doc.save(`pix${client}-${fileTag}.pdf`);
}

function fileBase(report: ProgramMonthlyReport, fileTag?: string) {
  const client = report.client_name ? `-${report.client_name.replace(/[^\w.-]+/g, '_')}` : '';
  return `pix${client}-${fileTag ?? report.month}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export async function exportProgrammingPixImage(
  report: ProgramMonthlyReport,
  options?: { fileTag?: string }
) {
  const entries = report.weeks.flatMap((week) => week.entries);
  if (entries.length === 0 || report.total_value <= 0) {
    throw new Error('Não há valor a pagar para gerar o PIX.');
  }

  const txid = (options?.fileTag ?? report.month).replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  const payload = buildPixPayload(report.total_value, txid);
  const qrUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 280,
  });
  const qr = await loadImage(qrUrl);

  const width = 560;
  const pad = 22;
  const contentWidth = width - pad * 2;
  const measure = document.createElement('canvas').getContext('2d');
  if (!measure) throw new Error('Não deu para montar a imagem.');
  measure.font = '15px Segoe UI, sans-serif';
  const rowLines = entries.map((entry) =>
    wrapText(measure, `${entry.reference}  ${entry.name}`, contentWidth - 90)
  );
  const rowsHeight = rowLines.reduce((sum, lines) => sum + lines.length * 20 + 6, 0);
  const height = 168 + rowsHeight + 250;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Não deu para montar a imagem.');

  ctx.fillStyle = '#f4f7fb';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#121c2e';
  ctx.fillRect(0, 0, width, 64);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px Segoe UI, sans-serif';
  ctx.fillText('Pagamento PIX', pad, 40);

  let y = 92;
  ctx.fillStyle = '#121c2e';
  ctx.font = 'bold 16px Segoe UI, sans-serif';
  ctx.fillText(PIX_RECEIVER_LABEL, pad, y);
  y += 22;
  ctx.font = '14px Segoe UI, sans-serif';
  ctx.fillStyle = '#3d4b63';
  const who = report.client_name?.trim();
  ctx.fillText(who ? `${who} · ${report.period_label}` : report.period_label, pad, y);
  y += 26;

  ctx.font = '15px Segoe UI, sans-serif';
  entries.forEach((entry, index) => {
    const lines = rowLines[index];
    ctx.fillStyle = '#121c2e';
    lines.forEach((line, lineIndex) => {
      ctx.fillText(line, pad, y);
      if (lineIndex === 0) {
        ctx.textAlign = 'right';
        ctx.fillText(formatMoney(entry.value), width - pad, y);
        ctx.textAlign = 'left';
      }
      y += 20;
    });
    y += 6;
  });

  y += 4;
  ctx.fillStyle = '#121c2e';
  ctx.fillRect(pad, y, contentWidth, 1);
  y += 26;
  ctx.font = 'bold 18px Segoe UI, sans-serif';
  ctx.fillText('Total', pad, y);
  ctx.textAlign = 'right';
  ctx.fillText(`R$ ${formatMoney(report.total_value)}`, width - pad, y);
  ctx.textAlign = 'left';
  y += 28;
  ctx.font = '14px Segoe UI, sans-serif';
  ctx.fillStyle = '#3d4b63';
  ctx.fillText(`Chave PIX (CPF): ${formatPixCpf(PIX_KEY)}`, pad, y);
  y += 16;

  const qrSize = 196;
  ctx.drawImage(qr, (width - qrSize) / 2, y, qrSize, qrSize);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Não deu para gravar a imagem.');
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${fileBase(report, options?.fileTag)}.png`;
  link.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Não deu para montar o QR.'));
    image.src = src;
  });
}
