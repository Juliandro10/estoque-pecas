import { NavLink, Outlet } from 'react-router-dom';

export function DesenvCadastroLayout() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Desenv-Cadastro</h1>
          <p>Tempos Sintral · peso bruto · fios Syntech</p>
        </div>
      </header>

      <nav className="sub-nav">
        <NavLink to="/desenv-cadastro" end className={({ isActive }) => (isActive ? 'active' : '')}>
          Cadastro
        </NavLink>
        <NavLink to="/desenv-cadastro/syntech" className={({ isActive }) => (isActive ? 'active' : '')}>
          Cadastro Syntech
        </NavLink>
        <NavLink to="/desenv-cadastro/fios" className={({ isActive }) => (isActive ? 'active' : '')}>
          Fios Syntech
        </NavLink>
        <a href="/ficha-custo/" target="_blank" rel="noreferrer">
          Ficha de custos
        </a>
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
