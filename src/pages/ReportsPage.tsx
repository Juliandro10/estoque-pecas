import { useEffect, useState } from 'react';

import { StockBadge } from '../components/StockBadge';
import { api } from '../lib/api';
import {
  exportReportPdf,
  exportReportTxt,
  exportWithdrawalsPdf,
  exportWithdrawalsTxt,
} from '../lib/report-export';
import type { Shift, StockReport } from '../types';
import { SHIFT_LABELS } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function ReportsPage() {
  const [report, setReport] = useState<StockReport | null>(null);
  const [filter, setFilter] = useState<'all' | 'baixo' | 'zerado'>('all');
  const [shiftFilter, setShiftFilter] = useState<'' | Shift>('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.report()
      .then(setReport)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!report) return <div className="loader">Carregando relatório…</div>;

  const visible =
    filter === 'baixo'
      ? report.lowStockParts
      : filter === 'zerado'
        ? report.outOfStockParts
        : report.parts;

  const withdrawals = shiftFilter
    ? report.recentWithdrawals.filter((w) => w.shift === shiftFilter)
    : report.recentWithdrawals;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Estoque atual</h1>
          <p>Quantidade em mãos e retiradas recentes</p>
        </div>
      </header>

      <section className="report-section">
        <h2>Estoque</h2>
        <div className="report-meta">
          Gerado em {formatDate(report.generated_at)} · {report.low_stock} com estoque baixo ·{' '}
          {report.out_of_stock} zerados
        </div>
        <div className="filters">
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">Estoque completo</option>
            <option value="baixo">Só estoque baixo</option>
            <option value="zerado">Só estoque zerado</option>
          </select>
        </div>
        <div className="export-actions">
          <button type="button" className="btn" onClick={() => exportReportTxt(report, filter)}>
            Estoque TXT
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => exportReportPdf(report, filter)}>
            Estoque PDF
          </button>
        </div>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Peça</th>
                <th>Qtd</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((part) => (
                <tr key={part.id}>
                  <td className="mono">{part.code}</td>
                  <td>{part.name}</td>
                  <td>
                    {part.quantity} {part.unit}
                  </td>
                  <td>
                    <StockBadge part={part} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>Retiradas</h2>
        <div className="filters">
          <select value={shiftFilter} onChange={(e) => setShiftFilter(e.target.value as '' | Shift)}>
            <option value="">Todos os turnos</option>
            <option value="cedo">{SHIFT_LABELS.cedo}</option>
            <option value="tarde">{SHIFT_LABELS.tarde}</option>
            <option value="noite">{SHIFT_LABELS.noite}</option>
          </select>
        </div>
        <div className="export-actions">
          <button
            type="button"
            className="btn"
            onClick={() => exportWithdrawalsTxt(report, shiftFilter || undefined)}
          >
            Retiradas TXT
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => exportWithdrawalsPdf(report, shiftFilter || undefined)}
          >
            Retiradas PDF
          </button>
        </div>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Peça</th>
                <th>Qtd</th>
                <th>Turno</th>
                <th>Retirou</th>
                <th>Solicitou</th>
                <th>Obs</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="empty">
                    Nenhuma retirada registrada.
                  </td>
                </tr>
              ) : (
                withdrawals.map((row) => (
                  <tr key={row.id}>
                    <td>{formatDate(row.created_at)}</td>
                    <td>
                      <span className="mono">{row.part_code}</span> — {row.part_name}
                    </td>
                    <td>{row.quantity}</td>
                    <td>{row.shift ? SHIFT_LABELS[row.shift] : '—'}</td>
                    <td>{row.withdrawn_by ?? '—'}</td>
                    <td>{row.requested_by ?? '—'}</td>
                    <td>{row.notes ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
