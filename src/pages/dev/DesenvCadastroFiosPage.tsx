import { Fragment, useEffect, useMemo, useState } from 'react';

import { loadSyntechYarnCatalog } from '../../lib/syntech-yarn-catalog-loader';
import { isLocalScannerAvailable } from '../../lib/local-programs-api';
import type { SyntechYarnCatalogFile, SyntechYarnType } from '../../types-programming';

function normalizeSearch(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim();
}

function matchesType(item: SyntechYarnType, query: string) {
  if (!query) return true;
  const haystack = normalizeSearch(`${item.codigo} ${item.tipo} ${item.cores.join(' ')}`);
  return haystack.includes(query);
}

export function DesenvCadastroFiosPage() {
  const [catalog, setCatalog] = useState<SyntechYarnCatalogFile | null>(null);
  const [query, setQuery] = useState('');
  const [expandedCodigo, setExpandedCodigo] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const localMode = isLocalScannerAvailable();

  async function refresh(sync = false) {
    if (sync) setSyncing(true);
    else setLoading(true);
    setError('');
    try {
      setCatalog(await loadSyntechYarnCatalog({ sync }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar catálogo.');
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  }

  useEffect(() => {
    void refresh(false);
  }, []);

  const normalizedQuery = normalizeSearch(query);
  const rows = useMemo(() => {
    if (!catalog) return [];
    return [...catalog.types]
      .filter((item) => matchesType(item, normalizedQuery))
      .sort((a, b) => a.codigo - b.codigo || a.tipo.localeCompare(b.tipo, 'pt-BR'));
  }, [catalog, normalizedQuery]);

  const updatedLabel = catalog?.updated_at
    ? new Date(catalog.updated_at).toLocaleString('pt-BR')
    : '—';

  return (
    <div>
      <div className="info-box">
        Use o código na coluna <strong>Cód</strong> no cadastro, por exemplo:{' '}
        <span className="mono">Codigo 44 - York Soft 3 CABOS TOMATE</span>
      </div>

      {error ? <div className="error-box">{error}</div> : null}

      <div className="filters card fios-toolbar">
        <input
          placeholder="Buscar por código, tipo ou cor…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className="btn btn-ghost" onClick={() => void refresh(false)} disabled={loading}>
          Recarregar
        </button>
        {localMode ? (
          <button type="button" className="btn" onClick={() => void refresh(true)} disabled={syncing}>
            {syncing ? 'Sincronizando…' : 'Atualizar do Syntech'}
          </button>
        ) : null}
      </div>

      <div className="card meta-line">
        <span>
          {rows.length} tipo(s)
          {catalog ? ` · catálogo ${updatedLabel}` : ''}
        </span>
        {catalog?.source ? <span className="muted">{catalog.source}</span> : null}
      </div>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando catálogo…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum fio encontrado.</div>
        ) : (
          <table className="fios-table">
            <thead>
              <tr>
                <th>Cód</th>
                <th>Tipo Syntech</th>
                <th>Cores</th>
                <th>Exemplo no cadastro</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const expanded = expandedCodigo === item.codigo;
                const preview = item.cores.slice(0, 8).join(', ');
                const rest = item.cores.length - 8;
                return (
                  <Fragment key={item.codigo}>
                    <tr>
                      <td className="mono cod-cell">{item.codigo}</td>
                      <td>{item.tipo}</td>
                      <td>
                        {item.cores.length === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <button
                            type="button"
                            className="colors-toggle"
                            onClick={() => setExpandedCodigo(expanded ? null : item.codigo)}
                          >
                            {item.cores.length} cor(es)
                            {rest > 0 && !expanded ? ` · ${preview}…` : ''}
                          </button>
                        )}
                      </td>
                      <td className="mono example-cell">Codigo {item.codigo} - …</td>
                    </tr>
                    {expanded && item.cores.length > 0 ? (
                      <tr className="colors-row">
                        <td colSpan={4}>{item.cores.join(', ')}</td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <style>{`
        .fios-toolbar {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          padding: 14px;
          margin-bottom: 14px;
        }
        .fios-toolbar input {
          flex: 1;
          min-width: 220px;
        }
        .meta-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 14px;
          margin-bottom: 14px;
          font-size: 13px;
        }
        .fios-table { width: 100%; }
        .cod-cell { width: 72px; font-weight: 700; color: var(--accent); }
        .example-cell { font-size: 12px; color: var(--muted); white-space: nowrap; }
        .colors-toggle {
          background: none;
          border: none;
          color: inherit;
          padding: 0;
          text-align: left;
          cursor: pointer;
          font: inherit;
          font-size: 13px;
        }
        .colors-toggle:hover { color: var(--accent); }
        .colors-row td {
          font-size: 12px;
          color: var(--muted);
          line-height: 1.5;
          border-top: none;
          padding-top: 0;
        }
      `}</style>
    </div>
  );
}
