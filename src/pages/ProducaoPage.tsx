import { useEffect, useMemo, useState } from 'react';

import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsSyntechProducao,
} from '../lib/local-programs-api';
import { exportProducaoPatraoCsv, exportProducaoPatraoPdf } from '../lib/producao-export';
import type { ProducaoBoard, ProducaoMaquina } from '../types-programming';

type Tab = 'maquinas' | 'pedidos';

function formatDate(iso: string | null) {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return iso;
  return `${day}/${month}/${year}`;
}

function maquinasTexto(values: number[]) {
  if (values.length === 0) return 'ainda não está em máquina';
  if (values.length === 1) return `Máq. ${values[0]}`;
  const last = values[values.length - 1];
  return `Máq. ${values.slice(0, -1).join(', ')} e ${last}`;
}

function matches(text: string, query: string) {
  if (!query) return true;
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .includes(query);
}

export function ProducaoPage() {
  const [tab, setTab] = useState<Tab>('maquinas');
  const [board, setBoard] = useState<ProducaoBoard | null>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const localMode = isLocalScannerAvailable();

  async function load() {
    setLoading(true);
    setError('');
    try {
      if (!localMode) {
        throw new Error('Abra o painel pelo Iniciar.bat na fábrica para ler o Syntech.');
      }
      const health = await localProgramsApi.health();
      if (!scannerSupportsSyntechProducao(health)) {
        throw new Error('Scanner antigo. Feche e abra de novo o Iniciar.bat.');
      }
      setBoard(await localProgramsApi.syntechProducao());
    } catch (err) {
      setBoard(null);
      setError(err instanceof Error ? err.message : 'Erro ao ler produção.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const normalizedQuery = query
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();

  const physical = useMemo(
    () => (board?.machines ?? []).filter((machine) => !machine.grupo),
    [board]
  );

  const pedidos = useMemo(() => {
    if (!board) return [];
    return board.pedidos.filter((pedido) =>
      matches(
        `${pedido.pedido ?? ''} ${pedido.cliente} ${pedido.referencias.join(' ')} ${pedido.maquinas.join(' ')}`,
        normalizedQuery
      )
    );
  }, [board, normalizedQuery]);

  const emMaquina = physical.filter((machine) => machine.agora).length;
  const naMaquinaPedidos = useMemo(
    () => pedidos.filter((pedido) => pedido.maquinas.length > 0),
    [pedidos]
  );
  const esperaPedidos = useMemo(
    () => pedidos.filter((pedido) => pedido.maquinas.length === 0 && pedido.restante > 0),
    [pedidos]
  );
  const updatedLabel = board?.updated_at ? new Date(board.updated_at).toLocaleString('pt-BR') : '—';

  return (
    <div className="producao-page">
      <header className="page-header">
        <div>
          <h1>Produção</h1>
          <p>O que cada máquina está tecendo agora e quando o pedido inteiro acaba</p>
        </div>
      </header>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters">
        <input
          placeholder="Buscar pedido, cliente, peça, máquina…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={() => void load()} disabled={loading}>
          {loading ? 'Lendo…' : 'Atualizar'}
        </button>
        <button type="button" className="btn" disabled={!board} onClick={() => board && exportProducaoPatraoPdf(board)}>
          Baixar PDF
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!board}
          onClick={() => board && exportProducaoPatraoCsv(board)}
        >
          Planilha Excel
        </button>
      </div>

      {board ? (
        <div className="stats-grid">
          <div className="card stat-card">
            <span>Máquinas tecendo agora</span>
            <strong>{emMaquina} / 15</strong>
          </div>
          <div className="card stat-card">
            <span>Pedidos em máquina</span>
            <strong>{board.pedidos.filter((pedido) => pedido.maquinas.length > 0).length}</strong>
          </div>
          <div className="card stat-card warn">
            <span>Pedidos em espera</span>
            <strong>{board.pedidos.filter((pedido) => pedido.maquinas.length === 0 && pedido.restante > 0).length}</strong>
          </div>
        </div>
      ) : null}

      <div className="muted tiny" style={{ marginBottom: 14 }}>
        {board
          ? `Atualizado ${updatedLabel}. Falta tecer = turno já fechado. 20h/dia, sem fim de semana. Fila em espera é só sugestão de programação, por prazo de entrega.`
          : localMode
            ? 'Lendo o Syntech…'
            : 'Precisa do Iniciar.bat na rede da fábrica'}
      </div>

      <nav className="sub-nav">
        <button type="button" className={tab === 'maquinas' ? 'active' : ''} onClick={() => setTab('maquinas')}>
          Máquinas agora
        </button>
        <button type="button" className={tab === 'pedidos' ? 'active' : ''} onClick={() => setTab('pedidos')}>
          Pedidos
        </button>
      </nav>

      {loading && !board ? <div className="loader">Carregando produção…</div> : null}

      {!loading && board && tab === 'maquinas' ? (
        <div className="maq-grid">
          {physical.map((machine) => (
            <MachineCard key={machine.numero} machine={machine} query={normalizedQuery} />
          ))}
        </div>
      ) : null}

      {!loading && board && tab === 'pedidos' ? (
        <div>
          <h2 className="sec-title">Nas máquinas agora</h2>
          <div className="card table-wrap">
            {naMaquinaPedidos.length === 0 ? (
              <div className="empty">Nenhum pedido em máquina.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Cliente</th>
                    <th>Peça</th>
                    <th>Ordens na tecelagem</th>
                    <th>Ainda por tecer</th>
                    <th>Nas máquinas</th>
                    <th>Pedido acaba em</th>
                    <th>Máquinas livres em</th>
                  </tr>
                </thead>
                <tbody>
                  {naMaquinaPedidos.map((pedido) => (
                    <tr
                      key={pedido.pedido ?? pedido.referencias.join('-')}
                      className={pedido.atrasado ? 'row-late' : ''}
                    >
                      <td className="mono">{pedido.pedido ?? '—'}</td>
                      <td>{pedido.cliente || '—'}</td>
                      <td>{pedido.referencias.join(', ') || '—'}</td>
                      <td>{pedido.ops}</td>
                      <td>
                        <strong>{pedido.restante}</strong>
                      </td>
                      <td>{maquinasTexto(pedido.maquinas)}</td>
                      <td>{formatDate(pedido.previsao)}</td>
                      <td>{formatDate(pedido.maquinas_livres_em)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <h2 className="sec-title">Em espera — sugestão de programação</h2>
          <p className="muted tiny" style={{ margin: '-8px 0 12px' }}>
            Ordenado pelo prazo de entrega. A máquina indicada é a que fica livre primeiro na mesma galga — não está
            lançado nela.
          </p>
          <div className="card table-wrap">
            {esperaPedidos.length === 0 ? (
              <div className="empty">Nenhum pedido em espera.</div>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Pedido</th>
                    <th>Prazo</th>
                    <th>Peça</th>
                    <th>Galga</th>
                    <th>Ainda por tecer</th>
                    <th>Sugestão de máquina</th>
                    <th>Pode entrar em</th>
                    <th>Acabaria em</th>
                  </tr>
                </thead>
                <tbody>
                  {esperaPedidos.map((pedido) => (
                    <tr
                      key={pedido.pedido ?? pedido.referencias.join('-')}
                      className={pedido.atrasado ? 'row-late' : ''}
                    >
                      <td className="mono">{pedido.pedido ?? '—'}</td>
                      <td>{formatDate(pedido.prazo)}</td>
                      <td>{pedido.referencias.join(', ') || '—'}</td>
                      <td>{pedido.galga ?? '—'}</td>
                      <td>
                        <strong>{pedido.restante}</strong>
                      </td>
                      <td>
                        {pedido.sugestao_maquina
                          ? `Máq. ${pedido.sugestao_maquina}`
                          : 'sem máquina da galga'}
                      </td>
                      <td>{formatDate(pedido.sugestao_entra_em)}</td>
                      <td>{formatDate(pedido.previsao)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      ) : null}

      <style>{`
        .producao-page { max-width: 1280px; }
        .sec-title { font-size: 16px; margin: 8px 0 12px; }
        .tiny { font-size: 12px; }
        .muted { color: var(--muted); }
        .sub-nav { display: flex; gap: 8px; margin-bottom: 20px; }
        .sub-nav button {
          color: var(--muted);
          padding: 8px 14px;
          border-radius: 10px;
          font-weight: 700;
          border: 1px solid var(--border);
          background: transparent;
        }
        .sub-nav button:hover { background: var(--inset); color: var(--text); }
        .sub-nav button.active {
          background: var(--accent-soft);
          color: var(--accent);
          border-color: transparent;
        }
        .maq-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
          gap: 12px;
        }
        .maq-card { padding: 14px; }
        .maq-card.live { border-color: rgba(45, 212, 191, 0.45); }
        .maq-card header {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 8px;
        }
        .maq-card h3 { margin: 0; font-size: 15px; }
        .row-late td { color: var(--amber); }
      `}</style>
    </div>
  );
}

function MachineCard({ machine, query }: { machine: ProducaoMaquina; query: string }) {
  const agora = machine.agora;
  if (agora && !matches(`${agora.programa} ${agora.pedido ?? ''} ${agora.cliente} ${machine.numero}`, query)) {
    return null;
  }
  return (
    <div className={`card maq-card${agora ? ' live' : ''}`}>
      <header>
        <h3>Máq. {machine.numero}</h3>
        <span className={`badge ${agora ? 'badge-ok' : 'badge-warn'}`}>{agora ? 'Tecido agora' : 'À espera'}</span>
      </header>
      {agora ? (
        <div>
          <div>
            <strong>{agora.programa}</strong>
          </div>
          <div className="muted tiny">
            Pedido {agora.pedido ?? '—'} · ordem {String(agora.item_op).padStart(6, '0')}
            {agora.maquinas_pedido.length > 1 ? ` · também na ${maquinasTexto(agora.maquinas_pedido.filter((n) => n !== machine.numero))}` : ''}
          </div>
          <div className="muted tiny">
            {agora.tam}
            {agora.cor ? ` ${agora.cor}` : ''} · faltam {agora.restante} nesta ordem
            {agora.fila_ordens > 0 ? ` · ${agora.fila_ordens} na fila (${agora.fila_pecas} pç)` : ''}
          </div>
          <div className="muted tiny">{agora.ops_no_pedido} ordem(ns) ainda na tecelagem</div>
          <div className="muted tiny">Pedido acaba em {formatDate(agora.previsao_pedido)}</div>
          {machine.sugestao ? (
            <div className="muted tiny">
              Sugestão depois: pedido {machine.sugestao.pedido ?? '—'} · prazo {formatDate(machine.sugestao.prazo)} ·
              entra {formatDate(machine.sugestao.entra_em)}
            </div>
          ) : null}
        </div>
      ) : (
        <div>
          <div className="muted tiny">Nada aberto nesta máquina</div>
          {machine.sugestao ? (
            <div className="muted tiny">
              Sugestão: pedido {machine.sugestao.pedido ?? '—'} · prazo {formatDate(machine.sugestao.prazo)} · entra{' '}
              {formatDate(machine.sugestao.entra_em)}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
