import { NavLink, Outlet } from 'react-router-dom';

export function DesenvControleLayout() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Desenv-Controle</h1>
          <p>Registro de programas desenvolvidos</p>
        </div>
      </header>

      <nav className="sub-nav">
        <NavLink to="/desenv-controle/extra" className={({ isActive }) => (isActive ? 'active' : '')}>
          Extra
        </NavLink>
        <NavLink to="/desenv-controle/dia-normal" className={({ isActive }) => (isActive ? 'active' : '')}>
          Dia normal
        </NavLink>
      </nav>

      <Outlet />

      <style>{`
        .sub-nav {
          display: flex;
          gap: 8px;
          margin-bottom: 20px;
        }
        .sub-nav a {
          text-decoration: none;
          color: var(--muted);
          padding: 8px 14px;
          border-radius: 10px;
          font-weight: 700;
          border: 1px solid var(--border);
        }
        .sub-nav a:hover {
          background: var(--inset);
          color: var(--text);
        }
        .sub-nav a.active {
          background: var(--accent-soft);
          color: var(--accent);
          border-color: transparent;
        }
      `}</style>
    </div>
  );
}
