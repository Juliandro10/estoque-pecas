import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

import { isFabricaChatEmail, loginFromEmail } from '../../shared/mensageiro-auth';
import { BackupButton } from './BackupButton';
import { MensageiroDock } from './MensageiroDock';
import { useAuth } from '../hooks/useAuth';
import { conversaNaoLida, garantirMeuPerfil, listenMinhasConversas } from '../lib/mensageiro-db';
import {
  atualizarTituloNaoLidas,
  avisosBloqueados,
  avisosPermitidos,
  jaAvisou,
  marcarAvisou,
  mostrarAvisoMensagem,
  pedirAvisos,
} from '../lib/mensageiro-notify';

export function Layout() {
  const { signOut, user } = useAuth();
  const location = useLocation();
  const fabrica = isFabricaChatEmail(user?.email);
  const desenvControleActive = location.pathname.startsWith('/desenv-controle');
  const quadroActive = location.pathname.startsWith('/quadro');
  const desenvActive = location.pathname.startsWith('/desenvolvimentos');
  const wideBoard = quadroActive || desenvActive || fabrica;
  const [naoLidas, setNaoLidas] = useState(0);
  const [avisoEstado, setAvisoEstado] = useState(
    typeof Notification === 'undefined' ? 'denied' : Notification.permission
  );
  const primeiraLista = useRef(true);

  useEffect(() => {
    if (!user?.uid) return;
    void garantirMeuPerfil({
      nome: user.displayName ?? undefined,
      papel: fabrica ? 'fabrica' : 'estoque',
    }).catch(() => undefined);
    return listenMinhasConversas(user.uid, (rows) => {
      const novas = rows.filter((c) => conversaNaoLida(c, user.uid));
      setNaoLidas(novas.length);
      atualizarTituloNaoLidas(novas.length);
      if (primeiraLista.current) {
        primeiraLista.current = false;
        for (const c of novas) marcarAvisou(c.id, c.atualizado_em);
        return;
      }
      if (document.hasFocus()) return;
      for (const c of novas) {
        if (!c.atualizado_em || jaAvisou(c.id, c.atualizado_em)) continue;
        marcarAvisou(c.id, c.atualizado_em);
        mostrarAvisoMensagem({
          titulo: 'Nova mensagem',
          corpo: c.ultimo_texto || 'Alguém escreveu no Estoque.',
          tag: c.id,
        });
      }
    });
  }, [user?.uid, user?.displayName, fabrica]);

  return (
    <div className={`layout${wideBoard ? ' quadro-open' : ''}${fabrica ? ' layout-fabrica' : ''}`}>
      {!fabrica ? (
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
            <NavLink to="/producao" className={({ isActive }) => (isActive ? 'active' : '')}>
              Produção
            </NavLink>
            <NavLink to="/quadro" className={({ isActive }) => (isActive ? 'active' : '')}>
              Tecelagem
            </NavLink>
            <NavLink to="/desenvolvimentos" className={({ isActive }) => (isActive ? 'active' : '')}>
              Desenvolvimentos
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
            <a href="/ficha-custo/" target="_blank" rel="noreferrer">
              Ficha de custos
            </a>
            <NavLink to="/desenv-m1" className={({ isActive }) => (isActive ? 'active' : '')}>
              Desenv-M1
            </NavLink>
            <NavLink to="/pessoas" className={({ isActive }) => (isActive ? 'active' : '')}>
              Pessoas
            </NavLink>
          </nav>
          <div className="sidebar-footer">
            {avisoEstado === 'default' ? (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void pedirAvisos().then((ok) => setAvisoEstado(ok ? 'granted' : Notification.permission));
                }}
              >
                Ativar avisos neste aparelho
              </button>
            ) : null}
            {avisosPermitidos() ? (
              <span className="user-email">Avisos ligados neste aparelho</span>
            ) : null}
            {avisosBloqueados() ? (
              <span className="user-email">Avisos bloqueados no navegador</span>
            ) : null}
            <BackupButton />
            <span className="user-email" title={user?.email ?? ''}>
              {loginFromEmail(user?.email)}
              {naoLidas ? ` · ${naoLidas} chat` : ''}
            </span>
            <NavLink to="/senha" className="btn btn-ghost btn-sm">
              Trocar senha
            </NavLink>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        </aside>
      ) : null}
      <main className="main">
        <Outlet />
      </main>
      <MensageiroDock />
      <style>{`
        .layout {
          --msg-dock-w: 220px;
          min-height: 100vh;
          display: grid;
          grid-template-columns: 220px minmax(0, 1fr) var(--msg-dock-w);
        }
        .layout.layout-fabrica {
          grid-template-columns: minmax(0, 1fr) var(--msg-dock-w);
        }
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
        .main { padding: 28px 32px 48px; max-width: 1100px; min-width: 0; }
        .layout.quadro-open .main { padding: 0; max-width: none; min-height: 100vh; background: #0e1218; }
        .tecelagem-embed { height: 100%; min-height: 100vh; }
        .tecelagem-embed iframe { display: block; width: 100%; height: 100%; min-height: 100vh; border: 0; background: #0e1218; }
        @media (max-width: 760px) {
          .layout, .layout.layout-fabrica { grid-template-columns: 1fr; }
          .nav { flex-direction: row; flex-wrap: wrap; }
          .main { padding: 20px 16px 40px; }
          .layout.quadro-open .main { padding: 0; }
        }
      `}</style>
    </div>
  );
}
