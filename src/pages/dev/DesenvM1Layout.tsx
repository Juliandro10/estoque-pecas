import { NavLink, Outlet } from 'react-router-dom';

export function DesenvM1Layout() {
  return (
    <div className="m1-layout">
      <header className="m1-head">
        <h1>Desenv-M1</h1>
        <nav className="m1-tabs">
          <NavLink to="/desenv-m1" end className={({ isActive }) => (isActive ? 'active' : '')}>
            Densidade
          </NavLink>
          <NavLink to="/desenv-m1/malhas" className={({ isActive }) => (isActive ? 'active' : '')}>
            Malhas
          </NavLink>
        </nav>
      </header>
      <Outlet />
      <style>{`
        .m1-layout { display: flex; flex-direction: column; gap: 16px; }
        .m1-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
        .m1-head h1 { margin: 0; }
        .m1-tabs { display: flex; gap: 8px; }
        .m1-tabs a {
          text-decoration: none;
          color: var(--muted);
          padding: 8px 14px;
          border-radius: 999px;
          font-weight: 700;
          font-size: 13px;
          border: 1px solid var(--border);
        }
        .m1-tabs a:hover { color: var(--text); background: var(--inset); }
        .m1-tabs a.active { color: var(--accent); border-color: var(--accent); background: var(--accent-soft); }
      `}</style>
    </div>
  );
}
