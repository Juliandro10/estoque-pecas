import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import type { Movement } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function movementLabel(type: Movement['type']) {
  if (type === 'in') return 'Entrada';
  if (type === 'out') return 'Saída';
  return 'Ajuste';
}

export function MovementsPage() {
  const [movements, setMovements] = useState<Movement[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.movements
      .list()
      .then(setMovements)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Movimentações</h1>
          <p>Histórico de entradas, saídas e ajustes</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : movements.length === 0 ? (
          <div className="empty">Nenhuma movimentação registrada.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Peça</th>
                <th>Tipo</th>
                <th>Qtd</th>
                <th>Antes</th>
                <th>Depois</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((mv) => (
                <tr key={mv.id}>
                  <td>{formatDate(mv.created_at)}</td>
                  <td>
                    <span className="mono">{mv.part_code}</span> — {mv.part_name}
                  </td>
                  <td>
                    <span className={`badge badge-${mv.type}`}>{movementLabel(mv.type)}</span>
                  </td>
                  <td>{mv.quantity}</td>
                  <td>{mv.previous_qty}</td>
                  <td>{mv.new_qty}</td>
                  <td>{mv.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
