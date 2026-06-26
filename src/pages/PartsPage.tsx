import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../components/Modal';
import { StockBadge } from '../components/StockBadge';
import { api } from '../lib/api';
import type { Part, PartStatus, Shift } from '../types';
import { MACHINE_NUMBERS, SHIFT_LABELS } from '../types';

export function PartsPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | PartStatus>('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [withdrawing, setWithdrawing] = useState<Part | null>(null);
  const [adjusting, setAdjusting] = useState<Part | null>(null);
  const [qty, setQty] = useState('');
  const [shift, setShift] = useState<Shift>('cedo');
  const [withdrawnBy, setWithdrawnBy] = useState('');
  const [requestedBy, setRequestedBy] = useState('');
  const [machine, setMachine] = useState('1');
  const [notes, setNotes] = useState('');
  const [adjustQty, setAdjustQty] = useState('');

  async function load() {
    setLoading(true);
    try {
      setParts(await api.parts.list({ q: q || undefined, status: status || undefined }));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [q, status]);

  function openWithdraw(part: Part) {
    setWithdrawing(part);
    setQty('1');
    setShift('cedo');
    setWithdrawnBy('');
    setRequestedBy('');
    setMachine('1');
    setNotes('');
  }

  async function saveWithdraw(e: FormEvent) {
    e.preventDefault();
    if (!withdrawing) return;
    try {
      await api.parts.withdraw(withdrawing.id, {
        quantity: Number(qty),
        shift,
        withdrawn_by: withdrawnBy,
        machine: Number(machine),
        requested_by: requestedBy || undefined,
        notes: notes || undefined,
      });
      setWithdrawing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao registrar retirada.');
    }
  }

  async function saveAdjust(e: FormEvent) {
    e.preventDefault();
    if (!adjusting) return;
    try {
      await api.parts.setQuantity(adjusting.id, Number(adjustQty));
      setAdjusting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ajustar.');
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Peças</h1>
          <p>Registre retiradas ou ajuste o estoque</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters">
        <input placeholder="Buscar código ou nome…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={status} onChange={(e) => setStatus(e.target.value as '' | PartStatus)}>
          <option value="">Todos os status</option>
          <option value="ok">OK</option>
          <option value="baixo">Baixo</option>
          <option value="zerado">Zerado</option>
        </select>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Peça</th>
                <th>Qtd</th>
                <th>Mín.</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {parts.map((part) => (
                <tr key={part.id}>
                  <td className="mono">{part.code}</td>
                  <td>{part.name}</td>
                  <td>
                    {part.quantity} {part.unit}
                  </td>
                  <td>
                    {part.min_quantity} {part.unit}
                  </td>
                  <td>
                    <StockBadge part={part} />
                  </td>
                  <td>
                    <div className="row-actions">
                      <button type="button" className="btn btn-sm" onClick={() => openWithdraw(part)}>
                        Retirada
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => {
                          setAdjusting(part);
                          setAdjustQty(String(part.quantity));
                        }}
                      >
                        Ajustar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {withdrawing ? (
        <Modal title={`Retirada — ${withdrawing.code}`} onClose={() => setWithdrawing(null)}>
          <p className="modal-sub">{withdrawing.name} · estoque: {withdrawing.quantity} {withdrawing.unit}</p>
          <form onSubmit={(e) => void saveWithdraw(e)} className="form-stack">
            <div className="field">
              <label>Quantidade retirada</label>
              <input
                autoFocus
                required
                type="number"
                min="1"
                max={withdrawing.quantity}
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Turno</label>
              <select value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
                <option value="cedo">{SHIFT_LABELS.cedo}</option>
                <option value="tarde">{SHIFT_LABELS.tarde}</option>
                <option value="noite">{SHIFT_LABELS.noite}</option>
              </select>
            </div>
            <div className="field">
              <label>Máquina</label>
              <select required value={machine} onChange={(e) => setMachine(e.target.value)}>
                {MACHINE_NUMBERS.map((n) => (
                  <option key={n} value={n}>Máquina {n}</option>
                ))}
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
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observações" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setWithdrawing(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Registrar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {adjusting ? (
        <Modal title={`Ajuste — ${adjusting.code}`} onClose={() => setAdjusting(null)}>
          <p className="modal-sub">{adjusting.name}</p>
          <form onSubmit={(e) => void saveAdjust(e)}>
            <div className="field">
              <label>Quantidade em estoque ({adjusting.unit})</label>
              <input
                autoFocus
                required
                type="number"
                min="0"
                step="1"
                value={adjustQty}
                onChange={(e) => setAdjustQty(e.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setAdjusting(null)}>
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
