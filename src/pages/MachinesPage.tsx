import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../components/Modal';
import { api } from '../lib/api';
import type { Machine } from '../types';

const emptyMachine = (): Partial<Machine> => ({
  code: '',
  name: '',
  location: '',
  notes: '',
});

export function MachinesPage() {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Machine> | null>(null);

  async function load() {
    setLoading(true);
    try {
      setMachines(await api.machines.list());
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar máquinas.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveMachine(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    try {
      if (editing.id) {
        await api.machines.update(editing.id, editing);
      } else {
        await api.machines.create(editing);
      }
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar máquina.');
    }
  }

  async function removeMachine(machine: Machine) {
    if (!confirm(`Excluir a máquina ${machine.code}?`)) return;
    try {
      await api.machines.remove(machine.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir máquina.');
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Máquinas</h1>
          <p>Equipamentos vinculados às peças</p>
        </div>
        <button type="button" className="btn" onClick={() => setEditing(emptyMachine())}>
          Nova máquina
        </button>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : machines.length === 0 ? (
          <div className="empty">Nenhuma máquina cadastrada.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Nome</th>
                <th>Local</th>
                <th>Observações</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {machines.map((machine) => (
                <tr key={machine.id}>
                  <td className="mono">{machine.code}</td>
                  <td>{machine.name}</td>
                  <td>{machine.location ?? '—'}</td>
                  <td>{machine.notes ?? '—'}</td>
                  <td>
                    <div className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => setEditing({ ...machine })}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => void removeMachine(machine)}
                      >
                        Excluir
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
        <Modal title={editing.id ? 'Editar máquina' : 'Nova máquina'} onClose={() => setEditing(null)}>
          <form onSubmit={(e) => void saveMachine(e)} className="form-grid">
            <div className="field">
              <label>Código</label>
              <input
                required
                value={editing.code ?? ''}
                onChange={(e) => setEditing({ ...editing, code: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Nome</label>
              <input
                required
                value={editing.name ?? ''}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label>Local</label>
              <input
                value={editing.location ?? ''}
                onChange={(e) => setEditing({ ...editing, location: e.target.value })}
              />
            </div>
            <div className="field full">
              <label>Observações</label>
              <textarea
                value={editing.notes ?? ''}
                onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
              />
            </div>
            <div className="modal-actions full">
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
