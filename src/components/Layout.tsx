import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar card">
        <div className="brand">
          <div className="brand-icon">⚙</div>
          <div>
            <strong>Estoque</strong>
            <span>Peças de máquinas</span>
          </div>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Painel
          </NavLink>
          <NavLink to="/pecas" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Peças
          </NavLink>
          <NavLink to="/maquinas" className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
            Máquinas
          </NavLink>
          <NavLink
            to="/movimentacoes"
            className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}
          >
            Movimentações
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="local-badge">Somente local</span>
        </div>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <style>{`
        .layout {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 240px 1fr;
        }
        .sidebar {
          display: flex;
          flex-direction: column;
          padding: 20px 16px;
          border-radius: 0;
          border-top: none;
          border-bottom: none;
          border-left: none;
        }
        .brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .brand-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--accent-soft);
          color: var(--accent);
          font-size: 20px;
        }
        .brand strong {
          display: block;
          font-size: 16px;
        }
        .brand span {
          display: block;
          font-size: 12px;
          color: var(--muted);
        }
        .nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          flex: 1;
        }
        .nav-link {
          text-decoration: none;
          color: var(--muted);
          padding: 10px 12px;
          border-radius: 10px;
          font-weight: 700;
          font-size: 14px;
        }
        .nav-link:hover {
          background: var(--inset);
          color: var(--text);
        }
        .nav-link.active {
          background: var(--accent-soft);
          color: var(--accent);
        }
        .sidebar-footer {
          margin-top: 24px;
        }
        .local-badge {
          display: inline-block;
          font-size: 11px;
          color: var(--mint);
          background: rgba(45, 212, 191, 0.12);
          padding: 6px 10px;
          border-radius: 999px;
          font-weight: 700;
        }
        .main {
          padding: 28px 32px 48px;
          max-width: 1200px;
        }
        @media (max-width: 820px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .sidebar {
            border-right: none;
            border-bottom: 1px solid var(--border);
          }
          .nav {
            flex-direction: row;
            flex-wrap: wrap;
          }
          .main {
            padding: 20px 16px 40px;
          }
        }
      `}</style>
    </div>
  );
}
