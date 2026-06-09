import { FormEvent, useCallback, useEffect, useState } from 'react';

import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import type { Movement, Shift } from '../types';
import { SHIFT_LABELS } from '../types';

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR');
}

export function WithdrawalsPage() {
  const [rows, setRows] = useState<Movement[]>([]);
  const [shift, setShift] = useState<'' | Shift>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Movement | null>(null);
  const [qty, setQty] = useState('');
  const [editShift, setEditShift] = useState<Shift>('cedo');
  const [withdrawnBy, setWithdrawnBy] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [notes, setNotes] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.withdrawals.list(shift || undefined));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [shift]);

  useEffect(() => {
    void load();
  }, [load]);

  function openEdit(row: Movement) {
    setEditing(row);
    setQty(String(row.quantity));
    setEditShift(row.shift ?? 'cedo');
    setWithdrawnBy(row.withdrawn_by ?? '');
    setRequestedBy(row.requested_by ?? '');
    setNotes(row.notes ?? '');
  }

  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.withdrawals.update(editing.id, {
        quantity: Number(qty),
        shift: editShift,
        withdrawn_by: withdrawnBy,
        requested_by: requestedBy || undefined,
        notes: notes || undefined,
      });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    }
  }

  async function remove(row: Movement) {
    const label = `${row.part_code} — ${row.quantity} un (${formatDate(row.created_at)})`;
    if (!confirm(`Apagar a retirada?\n${label}\n\nO estoque será recalculado.`)) return;
    try {
      await api.withdrawals.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar.');
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Retiradas</h1>
          <p>Histórico de saídas de peças</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters">
        <select value={shift} onChange={(e) => setShift(e.target.value as '' | Shift)}>
          <option value="">Todos os turnos</option>
          <option value="cedo">{SHIFT_LABELS.cedo}</option>
          <option value="tarde">{SHIFT_LABELS.tarde}</option>
          <option value="noite">{SHIFT_LABELS.noite}</option>
        </select>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhuma retirada registrada.</div>
        ) : (
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
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
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => openEdit(row)}>
                        Editar
                      </button>
                      <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(row)}>
                        Apagar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing ? (
        <Modal title={`Editar retirada — ${editing.part_code}`} onClose={() => setEditing(null)}>
          <p className="modal-sub">{editing.part_name}</p>
          <form onSubmit={(e) => void saveEdit(e)} className="form-stack">
            <div className="field">
              <label>Quantidade retirada</label>
              <input
                autoFocus
                required
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Turno</label>
              <select value={editShift} onChange={(e) => setEditShift(e.target.value as Shift)}>
                <option value="cedo">{SHIFT_LABELS.cedo}</option>
                <option value="tarde">{SHIFT_LABELS.tarde}</option>
                <option value="noite">{SHIFT_LABELS.noite}</option>
              </select>
            </div>
            <div className="field">
              <label>Quem retirou</label>
              <input required value={withdrawnBy} onChange={(e) => setWithdrawnBy(e.target.value)} />
            </div>
            <div className="field">
              <label>Quem solicitou</label>
              <input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} />
            </div>
            <div className="field">
              <label>Observações</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}
