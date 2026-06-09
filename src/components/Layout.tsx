import { NavLink, Outlet } from 'react-router-dom';

export function Layout() {
  return (
    <div className="layout">
      <aside className="sidebar card">
        <div className="brand">
          <strong>Estoque</strong>
          <span>Peças de máquinas</span>
        </div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Painel
          </NavLink>
          <NavLink to="/pecas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Peças
          </NavLink>
          <NavLink to="/retiradas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Retiradas
          </NavLink>
          <NavLink to="/relatorios" className={({ isActive }) => (isActive ? 'active' : '')}>
            Estoque
          </NavLink>
          <NavLink to="/relatorios-mensais" className={({ isActive }) => (isActive ? 'active' : '')}>
            Mensais
          </NavLink>
        </nav>
        <span className="local-badge">Somente local</span>
      </aside>
      <main className="main">
        <Outlet />
      </main>
      <style>{`
        .layout { min-height: 100vh; display: grid; grid-template-columns: 220px 1fr; }
        .sidebar { display: flex; flex-direction: column; padding: 20px 16px; border-radius: 0; border-left: none; border-top: none; border-bottom: none; }
        .brand { margin-bottom: 24px; }
        .brand strong { display: block; }
        .brand span { font-size: 12px; color: var(--muted); }
        .nav { display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .nav a { text-decoration: none; color: var(--muted); padding: 10px 12px; border-radius: 10px; font-weight: 700; }
        .nav a:hover { background: var(--inset); color: var(--text); }
        .nav a.active { background: var(--accent-soft); color: var(--accent); }
        .local-badge { font-size: 11px; color: var(--mint); background: rgba(45,212,191,.12); padding: 6px 10px; border-radius: 999px; font-weight: 700; }
        .main { padding: 28px 32px 48px; max-width: 1100px; }
        @media (max-width: 760px) {
          .layout { grid-template-columns: 1fr; }
          .nav { flex-direction: row; flex-wrap: wrap; }
          .main { padding: 20px 16px 40px; }
        }
      `}</style>
    </div>
  );
}
