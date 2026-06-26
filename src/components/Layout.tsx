import { NavLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../hooks/useAuth';

export function Layout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const desenvControleActive = location.pathname.startsWith('/desenv-controle');

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
          <NavLink to="/maquinas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Máquinas
          </NavLink>
          <NavLink to="/relatorios" className={({ isActive }) => (isActive ? 'active' : '')}>
            Estoque
          </NavLink>
          <NavLink to="/relatorios-mensais" className={({ isActive }) => (isActive ? 'active' : '')}>
            Mensais
          </NavLink>
          <NavLink
            to="/desenv-controle/extra"
            className={() => (desenvControleActive ? 'active' : '')}
          >
            Desenv-Controle
          </NavLink>
          <NavLink to="/desenv-cadastro" className={({ isActive }) => (isActive ? 'active' : '')}>
            Desenv-Cadastro
          </NavLink>
          <NavLink to="/desenv-m1" className={({ isActive }) => (isActive ? 'active' : '')}>
            Desenv-M1
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="user-email" title={user?.email ?? ''}>
            {user?.email}
          </span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
            Sair
          </button>
        </div>
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
        .sidebar-footer { margin-top: 24px; display: flex; flex-direction: column; gap: 8px; }
        .user-email { font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
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
