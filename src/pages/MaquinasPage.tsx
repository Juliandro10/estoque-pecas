import { useCallback, useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';
import type { Movement } from '../types';
import { MACHINE_NUMBERS, SHIFT_LABELS } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function MaquinasPage() {
  const [rows, setRows] = useState<Movement[]>([]);
  const [month, setMonth] = useState(monthKey(new Date().toISOString()));
  const [selected, setSelected] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.withdrawals.list());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(
    () => rows.filter((w) => w.machine != null && monthKey(w.created_at) === month),
    [rows, month]
  );

  const byMachine = useMemo(() => {
    const map = new Map<number, { total: number; records: Movement[] }>();
    for (const n of MACHINE_NUMBERS) map.set(n, { total: 0, records: [] });
    for (const w of filtered) {
      if (w.machine == null) continue;
      const row = map.get(w.machine)!;
      row.total += w.quantity;
      row.records.push(w);
    }
    return map;
  }, [filtered]);

  const monthOptions = useMemo(() => {
    const keys = new Set(rows.filter((w) => w.machine != null).map((w) => monthKey(w.created_at)));
    keys.add(monthKey(new Date().toISOString()));
    return [...keys].sort((a, b) => b.localeCompare(a));
  }, [rows]);

  const selectedRows = selected != null ? byMachine.get(selected)?.records ?? [] : [];

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Máquinas</h1>
          <p>Peças retiradas por máquina (1–15)</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthOptions.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="empty">Carregando…</div>
      ) : (
        <>
          <div className="machine-grid">
            {MACHINE_NUMBERS.map((n) => {
              const row = byMachine.get(n)!;
              const active = selected === n;
              return (
                <button
                  key={n}
                  type="button"
                  className={`card machine-card${active ? ' active' : ''}${row.total > 0 ? ' has-data' : ''}`}
                  onClick={() => setSelected(active ? null : n)}
                >
                  <span className="machine-num">Máq. {n}</span>
                  <strong>{row.total}</strong>
                  <span className="machine-meta">{row.records.length} retirada(s)</span>
                </button>
              );
            })}
          </div>

          {selected != null ? (
            <div className="card table-wrap" style={{ marginTop: 16 }}>
              <table>
                <thead>
                  <tr>
                    <th colSpan={6}>Máquina {selected} — {month}</th>
                  </tr>
                  <tr>
                    <th>Data</th>
                    <th>Peça</th>
                    <th>Qtd</th>
                    <th>Turno</th>
                    <th>Retirou</th>
                    <th>Obs</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="empty">Nenhuma retirada neste mês.</td>
                    </tr>
                  ) : (
                    selectedRows.map((w) => (
                      <tr key={w.id}>
                        <td>{formatDate(w.created_at)}</td>
                        <td>
                          <span className="mono">{w.part_code}</span> — {w.part_name}
                        </td>
                        <td>{w.quantity}</td>
                        <td>{w.shift ? SHIFT_LABELS[w.shift] : '—'}</td>
                        <td>{w.withdrawn_by ?? '—'}</td>
                        <td>{w.notes ?? '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <style>{`
        .machine-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
          gap: 10px;
        }
        .machine-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          padding: 14px 10px;
          cursor: pointer;
          border: 1px solid var(--border);
          background: var(--surface);
          text-align: center;
        }
        .machine-card:hover { border-color: var(--accent); }
        .machine-card.active {
          border-color: var(--accent);
          background: var(--accent-soft);
        }
        .machine-card.has-data strong { color: var(--accent); }
        .machine-num { font-size: 12px; color: var(--muted); font-weight: 700; }
        .machine-card strong { font-size: 22px; line-height: 1.1; }
        .machine-meta { font-size: 11px; color: var(--muted); }
      `}</style>
    </div>
  );
}
