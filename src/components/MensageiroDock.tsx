import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { isFabricaChatEmail, loginFromEmail } from '../../shared/mensageiro-auth';
import { useAuth } from '../hooks/useAuth';
import {
  abrirConversa,
  conversaNaoLida,
  enviarMsg,
  listenMinhasConversas,
  listenMsgs,
  listenPessoas,
  marcarLida,
  msgFoiVista,
  outroUid,
  ultimoFoiVisto,
  type MensageiroConversa,
  type MensageiroMsg,
  type MensageiroPessoa,
} from '../lib/mensageiro-db';

function hora(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function VistoTicks({ visto, enviado }: { visto: boolean; enviado: boolean }) {
  if (!enviado) {
    return (
      <span className="msg-ticks" title="Enviando">
        ✓
      </span>
    );
  }
  return (
    <span className={`msg-ticks${visto ? ' visto' : ''}`} title={visto ? 'Vista' : 'Entregue'}>
      <svg viewBox="0 0 16 11" width="16" height="11" aria-hidden="true">
        <path d="M11.07.65 4.62 8.01 1.4 4.8.28 5.92l4.34 4.34 7.57-8.47z" fill="currentColor" />
        <path d="M15.07.65 8.62 8.01 7.7 7.1 6.58 8.22 8.62 10.26 16.18 1.77z" fill="currentColor" />
      </svg>
    </span>
  );
}

const LARGURA_MIN = 180;
const LARGURA_MAX = 640;
const CHAVE_LARGURA = 'mensageiro-largura';

function lerLargura() {
  const n = Number(localStorage.getItem(CHAVE_LARGURA));
  if (!Number.isFinite(n)) return 220;
  return Math.min(LARGURA_MAX, Math.max(LARGURA_MIN, n));
}

export function MensageiroDock() {
  const { signOut, user } = useAuth();
  const uid = user?.uid ?? '';
  const fabrica = isFabricaChatEmail(user?.email);
  const [pessoas, setPessoas] = useState<MensageiroPessoa[]>([]);
  const [conversas, setConversas] = useState<MensageiroConversa[]>([]);
  const [msgs, setMsgs] = useState<MensageiroMsg[]>([]);
  const [ativa, setAtiva] = useState('');
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [aberta, setAberta] = useState(false);
  const [largura, setLargura] = useState(lerLargura);
  const [arrastando, setArrastando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const alcaRef = useRef<HTMLDivElement>(null);
  const arrasteRef = useRef<{ x: number; w: number } | null>(null);
  const larguraRef = useRef(largura);
  larguraRef.current = largura;
  const chaveAtiva = uid ? `mensageiro-ativa:${uid}` : '';

  useEffect(() => {
    if (!chaveAtiva) return;
    const saved = localStorage.getItem(chaveAtiva);
    if (saved) setAtiva(saved);
  }, [chaveAtiva]);

  useEffect(() => {
    if (chaveAtiva && ativa) localStorage.setItem(chaveAtiva, ativa);
  }, [chaveAtiva, ativa]);

  useEffect(() => {
    if (!uid) return;
    const stopPessoas = listenPessoas(setPessoas, (err) => setErro(err.message));
    const stopConv = listenMinhasConversas(uid, setConversas, (err) => setErro(err.message));
    return () => {
      stopPessoas();
      stopConv();
    };
  }, [uid]);

  useEffect(() => {
    if (!ativa) {
      setMsgs([]);
      return;
    }
    return listenMsgs(ativa, setMsgs, (err) => setErro(err.message));
  }, [ativa]);

  useEffect(() => {
    if (!ativa || !uid) return;
    let t: number | undefined;
    const marcarSeVisivel = () => {
      if (document.hidden) return;
      window.clearTimeout(t);
      t = window.setTimeout(() => {
        void marcarLida(ativa, uid).catch(() => undefined);
      }, 250);
    };
    marcarSeVisivel();
    document.addEventListener('visibilitychange', marcarSeVisivel);
    window.addEventListener('focus', marcarSeVisivel);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('visibilitychange', marcarSeVisivel);
      window.removeEventListener('focus', marcarSeVisivel);
    };
  }, [ativa, uid, msgs.length]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, ativa]);

  useEffect(() => {
    const layout = document.querySelector('.layout') as HTMLElement | null;
    if (layout) layout.style.setProperty('--msg-dock-w', `${largura}px`);
    localStorage.setItem(CHAVE_LARGURA, String(largura));
  }, [largura]);

  useEffect(() => {
    const aplicar = (clientX: number) => {
      const d = arrasteRef.current;
      if (!d) return;
      const teto = Math.min(LARGURA_MAX, Math.round(window.innerWidth * 0.55));
      setLargura(Math.min(teto, Math.max(LARGURA_MIN, d.w + (d.x - clientX))));
    };
    const mover = (ev: MouseEvent) => aplicar(ev.clientX);
    const soltar = () => {
      if (!arrasteRef.current) return;
      arrasteRef.current = null;
      setArrastando(false);
    };
    const iniciar = (ev: PointerEvent | MouseEvent) => {
      ev.preventDefault();
      arrasteRef.current = { x: ev.clientX, w: larguraRef.current };
      setArrastando(true);
      if ('pointerId' in ev && alcaRef.current) {
        try {
          alcaRef.current.setPointerCapture(ev.pointerId);
        } catch {
          /* captura só existe em gesto real do mouse */
        }
      }
    };
    const alca = alcaRef.current;
    alca?.addEventListener('pointerdown', iniciar);
    window.addEventListener('pointermove', mover);
    window.addEventListener('mousemove', mover);
    window.addEventListener('pointerup', soltar);
    window.addEventListener('mouseup', soltar);
    return () => {
      alca?.removeEventListener('pointerdown', iniciar);
      window.removeEventListener('pointermove', mover);
      window.removeEventListener('mousemove', mover);
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('mouseup', soltar);
    };
  }, []);

  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const outros = [...pessoas.filter((p) => p.id !== uid)].sort((a, b) => {
    const ca = conversas.find((c) => c.id === [uid, a.id].sort().join('__'));
    const cb = conversas.find((c) => c.id === [uid, b.id].sort().join('__'));
    return (cb?.atualizado_em ?? '').localeCompare(ca?.atualizado_em ?? '');
  });
  const conversaAtiva = conversas.find((c) => c.id === ativa);
  const outro = conversaAtiva ? porId.get(outroUid(conversaAtiva, uid)) : porId.get(ativa.split('__').find((id) => id !== uid) ?? '');
  const eu = pessoas.find((p) => p.id === uid);
  const meuNome = eu?.nome || loginFromEmail(user?.email);
  const naoLidas = conversas.filter((c) => conversaNaoLida(c, uid)).length;

  async function escolherPessoa(id: string) {
    if (!uid || id === uid) return;
    setErro('');
    setAberta(true);
    try {
      setAtiva(await abrirConversa(uid, id));
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para abrir.');
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!uid || !ativa) return;
    setEnviando(true);
    setErro('');
    try {
      await enviarMsg({ conversa: ativa, de: uid, texto });
      setTexto('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <aside className={`msg-dock${aberta ? ' open' : ''}${arrastando ? ' resizing' : ''}`}>
      <div
        ref={alcaRef}
        className="msg-dock-resize"
        role="separator"
        aria-orientation="vertical"
        aria-label="Ajustar largura do chat"
        title="Arraste para ajustar o chat"
      />
      <button type="button" className="msg-fab" onClick={() => setAberta((v) => !v)}>
        Chat{naoLidas ? ` (${naoLidas})` : ''}
      </button>
      <div className="msg-dock-body">
        <header className="msg-dock-top">
          <strong>Chat</strong>
          <span>{meuNome}</span>
        </header>
        {erro ? <div className="error-box">{erro}</div> : null}
        <ul className="msg-dock-people">
          {outros.map((p) => {
            const cid = [uid, p.id].sort().join('__');
            const conv = conversas.find((c) => c.id === cid);
            const nova = conv ? conversaNaoLida(conv, uid) : false;
            return (
              <li key={p.id}>
                <button type="button" className={ativa === cid ? 'on' : ''} onClick={() => void escolherPessoa(p.id)}>
                  {p.nome}
                  {nova ? ' •' : ''}
                  {conv?.ultimo_texto ? (
                    <em>
                      {conv.ultimo_de === uid ? (
                        <VistoTicks visto={ultimoFoiVisto(conv, uid)} enviado />
                      ) : null}
                      {conv.ultimo_texto}
                    </em>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        {ativa ? (
          <>
            <div className="msg-dock-feed">
              {msgs.map((m) => (
                <p key={m.id} className={m.de === uid ? 'mine' : ''}>
                  <small>
                    {m.de === uid ? 'Você' : porId.get(m.de)?.nome ?? ''} {hora(m.criado_em)}
                    {m.de === uid ? (
                      <VistoTicks visto={msgFoiVista(conversaAtiva, m, uid)} enviado={Boolean(m.criado_em)} />
                    ) : null}
                  </small>
                  {m.texto}
                </p>
              ))}
              <div ref={bottomRef} />
            </div>
            <form onSubmit={(e) => void handleSend(e)}>
              <input
                required
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={`Para ${outro?.nome ?? 'esta pessoa'}…`}
              />
            </form>
          </>
        ) : (
          <p className="msg-dock-empty">Toque em alguém.</p>
        )}
        {fabrica ? (
          <div className="msg-dock-foot">
            <a href="/senha">Trocar senha</a>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void signOut()}>
              Sair
            </button>
          </div>
        ) : null}
      </div>
      <style>{`
        .msg-dock {
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
          min-height: 0;
          height: 100vh;
          background: var(--surface);
          border-left: 1px solid var(--border);
        }
        .msg-dock.resizing { user-select: none; }
        .msg-dock-resize {
          position: absolute;
          left: -3px;
          top: 0;
          bottom: 0;
          width: 12px;
          z-index: 3;
          padding: 0;
          border: 0;
          background: transparent;
          cursor: col-resize;
          touch-action: none;
        }
        .msg-dock-resize::after {
          content: '';
          position: absolute;
          top: 42%;
          left: 2px;
          width: 3px;
          height: 36px;
          border-radius: 99px;
          background: var(--border);
        }
        .msg-dock-resize:hover, .msg-dock.resizing .msg-dock-resize {
          background: var(--accent-soft);
        }
        .msg-dock-resize:hover::after, .msg-dock.resizing .msg-dock-resize::after {
          background: var(--accent);
        }
        .msg-fab { display: none; }
        .msg-dock-body {
          display: flex;
          flex-direction: column;
          min-height: 0;
          height: 100%;
        }
        .msg-dock-top {
          padding: 10px 10px 8px;
          border-bottom: 1px solid var(--border);
        }
        .msg-dock-top strong { display: block; font-size: 13px; }
        .msg-dock-top span { font-size: 10px; color: var(--muted); word-break: break-all; }
        .msg-dock-people {
          list-style: none;
          margin: 0;
          padding: 6px;
          display: flex;
          flex-direction: column;
          gap: 2px;
          max-height: 28%;
          overflow: auto;
        }
        .msg-dock-people button {
          width: 100%;
          text-align: left;
          background: transparent;
          border: 0;
          color: inherit;
          padding: 6px 8px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 700;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .msg-dock-people em {
          font-style: normal;
          font-weight: 500;
          font-size: 11px;
          color: var(--muted);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          gap: 4px;
          min-width: 0;
        }
        .msg-dock-people em .msg-ticks { flex-shrink: 0; }
        .msg-dock-people button.on, .msg-dock-people button:hover { background: var(--accent-soft); color: var(--accent); }
        .msg-dock-feed {
          flex: 1;
          overflow: auto;
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .msg-dock-feed p {
          margin: 0;
          font-size: 12px;
          background: var(--inset);
          border-radius: 8px;
          padding: 6px 8px;
          white-space: pre-wrap;
        }
        .msg-dock-feed p.mine { margin-left: 12%; background: var(--accent-soft); }
        .msg-dock-feed small { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: 10px; }
        .msg-ticks {
          display: inline-flex;
          align-items: center;
          color: var(--muted);
          line-height: 1;
        }
        .msg-dock-feed .msg-ticks { margin-left: auto; }
        .msg-ticks.visto { color: #53bdeb; }
        .msg-dock-empty { margin: 8px; font-size: 12px; color: var(--muted); }
        .msg-dock form { padding: 8px; border-top: 1px solid var(--border); }
        .msg-dock form input { width: 100%; }
        .msg-dock-foot { padding: 8px; border-top: 1px solid var(--border); display: flex; flex-direction: column; gap: 6px; }
        .msg-dock-foot a { font-size: 12px; color: var(--muted); }
        @media (max-width: 760px) {
          .msg-fab {
            display: block;
            position: fixed;
            right: 12px;
            bottom: 12px;
            z-index: 40;
            background: var(--accent);
            color: #0b1220;
            border: 0;
            border-radius: 999px;
            padding: 10px 14px;
            font-weight: 800;
          }
          .msg-dock {
            position: fixed;
            inset: auto 0 0 auto;
            width: min(92vw, 360px);
            height: min(70vh, 520px);
            z-index: 39;
            border: 1px solid var(--border);
            border-radius: 12px 0 0 0;
            transform: translateY(110%);
          }
          .msg-dock.open { transform: none; }
          .msg-dock-resize { display: none; }
        }
      `}</style>
    </aside>
  );
}
