import { useEffect, useState } from 'react';

import { StockBadge } from '../components/StockBadge';
import { api } from '../lib/api';
import type { Dashboard } from '../types';
import { SHIFT_LABELS } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.dashboard()
      .then(setData)
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loader">Carregando…</div>;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Painel</h1>
          <p>Visão geral do estoque</p>
        </div>
      </header>

      <div className="stats-grid">
        <div className="card stat-card">
          <span>Peças</span>
          <strong>{data.total_parts}</strong>
        </div>
        <div className="card stat-card warn">
          <span>Estoque baixo</span>
          <strong>{data.low_stock}</strong>
        </div>
        <div className="card stat-card danger">
          <span>Zeradas</span>
          <strong>{data.out_of_stock}</strong>
        </div>
      </div>

      <div className="card table-wrap">
        <table>
          <thead>
            <tr>
              <th colSpan={4}>Peças que precisam de atenção</th>
            </tr>
            <tr>
              <th>Código</th>
              <th>Peça</th>
              <th>Qtd</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.lowStockParts.length === 0 ? (
              <tr>
                <td colSpan={4} className="empty">
                  Tudo em dia.
                </td>
              </tr>
            ) : (
              data.lowStockParts.map((part) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="card table-wrap" style={{ marginTop: 16 }}>
        <table>
          <thead>
            <tr>
              <th colSpan={6}>Últimas retiradas</th>
            </tr>
            <tr>
              <th>Data</th>
              <th>Peça</th>
              <th>Qtd</th>
              <th>Máq.</th>
              <th>Turno</th>
              <th>Retirou</th>
            </tr>
          </thead>
          <tbody>
            {data.recentWithdrawals.length === 0 ? (
              <tr>
                <td colSpan={6} className="empty">
                  Nenhuma retirada ainda.
                </td>
              </tr>
            ) : (
              data.recentWithdrawals.map((m) => (
                <tr key={m.id}>
                  <td>{formatDate(m.created_at)}</td>
                  <td>
                    {m.part_code} — {m.part_name}
                  </td>
                  <td>{m.quantity}</td>
                  <td>{m.machine ?? '—'}</td>
                  <td>{m.shift ? SHIFT_LABELS[m.shift] : '—'}</td>
                  <td>{m.withdrawn_by ?? '—'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
