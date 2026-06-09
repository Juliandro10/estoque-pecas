import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../components/Modal';
import { StockBadge } from '../components/StockBadge';
import { api } from '../lib/api';
import type { Machine, Part } from '../types';

export function PartsPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [q, setQ] = useState('');
  const [machineId, setMachineId] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<Part | null>(null);
  const [moveQty, setMoveQty] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [partsData, machinesData] = await Promise.all([
        api.parts.list({
          q: q || undefined,
          machineId: machineId ? Number(machineId) : undefined,
          lowOnly,
        }),
        api.machines.list(),
      ]);
      setParts(partsData);
      setMachines(machinesData);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar peças.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, [q, machineId, lowOnly]);

  function openAdjust(part: Part) {
    setMoving(part);
    setMoveQty(String(part.quantity));
  }

  async function saveQuantity(e: FormEvent) {
    e.preventDefault();
    if (!moving) return;
    try {
      await api.movements.create({
        part_id: moving.id,
        type: 'adjust',
        quantity: Number(moveQty),
        reason: 'Atualização de estoque',
      });
      setMoving(null);
      setMoveQty('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar quantidade.');
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Peças</h1>
          <p>Catálogo pré-carregado — ajuste só a quantidade</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters">
        <input
          placeholder="Buscar por código, nome, fornecedor…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={machineId} onChange={(e) => setMachineId(e.target.value)}>
          <option value="">Todas as máquinas</option>
          {machines.map((m) => (
            <option key={m.id} value={m.id}>
              {m.code} — {m.name}
            </option>
          ))}
        </select>
        <label className="check-filter">
          <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
          Só estoque baixo
        </label>
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : parts.length === 0 ? (
          <div className="empty">
            Nenhuma peça no catálogo. Preencha <span className="mono">data/catalogo.json</span> e rode{' '}
            <span className="mono">npm run estoque:import</span>.
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Máquina</th>
                <th>Local</th>
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
                  <td>{part.machine_name ?? '—'}</td>
                  <td>{part.location ?? '—'}</td>
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
                    <button type="button" className="btn btn-sm" onClick={() => openAdjust(part)}>
                      Ajustar qtd
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {moving ? (
        <Modal title={`Quantidade — ${moving.code}`} onClose={() => setMoving(null)}>
          <p className="move-info">
            {moving.name}
            {moving.machine_name ? ` · ${moving.machine_name}` : ''}
          </p>
          <form onSubmit={(e) => void saveQuantity(e)} className="form-grid">
            <div className="field full">
              <label>Quantidade em estoque ({moving.unit})</label>
              <input
                required
                autoFocus
                type="number"
                min="0"
                step="any"
                value={moveQty}
                onChange={(e) => setMoveQty(e.target.value)}
              />
            </div>
            <div className="modal-actions full">
              <button type="button" className="btn btn-ghost" onClick={() => setMoving(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn">
                Salvar
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      <style>{`
        .check-filter {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: var(--muted);
          padding-top: 10px;
        }
        .check-filter input {
          width: auto;
        }
        .move-info {
          margin: 0 0 16px;
          color: var(--muted);
        }
      `}</style>
    </div>
  );
}
