import { useEffect, useState } from 'react';

import { StockBadge } from '../components/StockBadge';
import { api } from '../lib/api';
import type { Dashboard } from '../types';

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function movementLabel(type: string) {
  if (type === 'in') return 'Entrada';
  if (type === 'out') return 'Saída';
  return 'Ajuste';
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
  if (!data) return <div className="loader">Carregando painel…</div>;

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Painel</h1>
          <p>Visão geral do estoque local</p>
        </div>
      </header>

      <div className="stats-grid">
        <div className="card stat-card">
          <span>Peças cadastradas</span>
          <strong>{data.total_parts}</strong>
        </div>
        <div className="card stat-card">
          <span>Máquinas</span>
          <strong>{data.total_machines}</strong>
        </div>
        <div className="card stat-card warn">
          <span>Estoque baixo</span>
          <strong>{data.low_stock}</strong>
        </div>
        <div className="card stat-card danger">
          <span>Zeradas</span>
          <strong>{data.out_of_stock}</strong>
        </div>
        <div className="card stat-card">
          <span>Valor estimado</span>
          <strong>{formatMoney(data.stock_value)}</strong>
        </div>
      </div>

      <div className="dashboard-grid">
        <section className="card">
          <div className="section-head">
            <h2>Peças com estoque baixo</h2>
          </div>
          {data.lowStockParts.length === 0 ? (
            <div className="empty">Nenhuma peça abaixo do mínimo.</div>
          ) : (
            <div className="table-wrap">
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
                  {data.lowStockParts.map((part) => (
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
          )}
        </section>

        <section className="card">
          <div className="section-head">
            <h2>Últimas movimentações</h2>
          </div>
          {data.recentMovements.length === 0 ? (
            <div className="empty">Nenhuma movimentação registrada.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Peça</th>
                    <th>Tipo</th>
                    <th>Qtd</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentMovements.map((mv) => (
                    <tr key={mv.id}>
                      <td>{formatDate(mv.created_at)}</td>
                      <td>
                        <span className="mono">{mv.part_code}</span> — {mv.part_name}
                      </td>
                      <td>
                        <span className={`badge badge-${mv.type}`}>{movementLabel(mv.type)}</span>
                      </td>
                      <td>{mv.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .dashboard-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .section-head {
          padding: 18px 18px 0;
        }
        .section-head h2 {
          margin: 0 0 12px;
          font-size: 18px;
        }
        @media (max-width: 900px) {
          .dashboard-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
