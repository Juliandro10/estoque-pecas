import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

import type { ProducaoBoard } from '../types-programming';

function stamp() {
  return new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
}

function fileStamp() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

function formatDate(iso: string | null) {
  if (!iso) return 'ainda sem data';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function maquinasTexto(values: number[]) {
  if (values.length === 0) return 'ainda não está em máquina';
  if (values.length === 1) return `máquina ${values[0]}`;
  const last = values[values.length - 1];
  return `máquinas ${values.slice(0, -1).join(', ')} e ${last}`;
}

function csvCell(value: string | number | null | undefined) {
  const text = value == null ? '' : String(value);
  if (/[;"\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function downloadText(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportProducaoPatraoPdf(board: ProducaoBoard) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const hoje = stamp();
  const live = board.machines.filter((machine) => !machine.grupo);
  const pedidosNaMaquina = board.pedidos.filter((pedido) => pedido.maquinas.length > 0);

  doc.setFontSize(18);
  doc.text('Produção da fábrica', 14, 16);
  doc.setFontSize(11);
  doc.setTextColor(80);
  doc.text(`Atualizado em ${hoje}`, 14, 24);
  doc.text('Uma linha = um pedido. Se o pedido está em duas máquinas, as duas ficam livres na mesma data.', 14, 30);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 36,
    head: [['Máquina', 'Está tecendo agora', 'Pedido', 'Cliente', 'Falta no pedido', 'Pedido acaba em']],
    body: live.map((machine) => {
      const agora = machine.agora;
      if (!agora) return [`Máq. ${machine.numero}`, 'Parada / à espera', '—', '—', '—', '—'];
      return [
        `Máq. ${machine.numero}`,
        agora.programa,
        agora.pedido != null ? String(agora.pedido) : '—',
        agora.cliente || '—',
        `${agora.ops_no_pedido} ordem(ns)`,
        formatDate(agora.previsao_pedido),
      ];
    }),
    styles: { fontSize: 10, cellPadding: 2.4 },
    headStyles: { fillColor: [18, 28, 46], fontSize: 10 },
    columnStyles: {
      0: { cellWidth: 28 },
      4: { cellWidth: 32 },
      5: { cellWidth: 32 },
    },
  });

  const afterMachines = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 36;

  doc.setFontSize(14);
  doc.text('Quando cada pedido termina', 14, afterMachines + 12);

  autoTable(doc, {
    startY: afterMachines + 16,
    head: [['Pedido', 'Cliente', 'Peça', 'Ordens', 'Peças que faltam', 'Nas máquinas', 'Acaba em', 'Máquinas livres em']],
    body: (pedidosNaMaquina.length ? pedidosNaMaquina : board.pedidos.slice(0, 25)).map((pedido) => [
      pedido.pedido != null ? String(pedido.pedido) : '—',
      pedido.cliente || '—',
      pedido.referencias.join(', ') || '—',
      String(pedido.ops),
      String(pedido.restante),
      maquinasTexto(pedido.maquinas),
      formatDate(pedido.previsao),
      formatDate(pedido.maquinas_livres_em),
    ]),
    styles: { fontSize: 9, cellPadding: 2.2 },
    headStyles: { fillColor: [18, 28, 46], fontSize: 9 },
  });

  doc.save(`producao-${fileStamp()}.pdf`);
}

export function exportProducaoPatraoCsv(board: ProducaoBoard) {
  const linhas = [
    ['PRODUÇÃO DA FÁBRICA', stamp()],
    [],
    ['Como ler: pedido pode ter várias ordens. Se estiver em 2 máquinas, as duas terminam juntas.'],
    [],
    ['O QUE CADA MÁQUINA ESTÁ FAZENDO'],
    ['Máquina', 'Está tecendo agora', 'Pedido', 'Cliente', 'Quantas ordens no pedido', 'Pedido acaba em'],
    ...board.machines
      .filter((machine) => !machine.grupo)
      .map((machine) => {
        const agora = machine.agora;
        if (!agora) return [String(machine.numero), 'Parada / à espera', '', '', '', ''];
        return [
          String(machine.numero),
          agora.programa,
          agora.pedido ?? '',
          agora.cliente,
          String(agora.ops_no_pedido),
          formatDate(agora.previsao_pedido),
        ];
      }),
    [],
    ['QUANDO CADA PEDIDO TERMINA'],
    ['Pedido', 'Cliente', 'Peça', 'Ordens', 'Peças que faltam', 'Nas máquinas', 'Acaba em', 'Máquinas livres em'],
    ...board.pedidos.map((pedido) => [
      pedido.pedido ?? '',
      pedido.cliente,
      pedido.referencias.join(', '),
      pedido.ops,
      pedido.restante,
      maquinasTexto(pedido.maquinas),
      formatDate(pedido.previsao),
      formatDate(pedido.maquinas_livres_em),
    ]),
  ];

  const csv = `\uFEFF${linhas.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  downloadText(`producao-${fileStamp()}.csv`, csv, 'text/csv;charset=utf-8');
}
