import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import { isFabricaChatEmail } from '../../shared/mensageiro-auth';
import { useAuth } from '../hooks/useAuth';
import {
  abrirConversa,
  conversaNaoLida,
  enviarMsg,
  garantirMeuPerfil,
  listarRefsDesenv,
  listenMinhasConversas,
  listenMsgs,
  listenPessoas,
  marcarLida,
  outroUid,
  type MensageiroConversa,
  type MensageiroMsg,
  type MensageiroPessoa,
} from '../lib/mensageiro-db';

function hora(iso: string) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export function MensagensPage() {
  const { user } = useAuth();
  const uid = user?.uid ?? '';
  const [pessoas, setPessoas] = useState<MensageiroPessoa[]>([]);
  const [conversas, setConversas] = useState<MensageiroConversa[]>([]);
  const [msgs, setMsgs] = useState<MensageiroMsg[]>([]);
  const [ativa, setAtiva] = useState('');
  const [texto, setTexto] = useState('');
  const [ref, setRef] = useState('');
  const [refs, setRefs] = useState<string[]>([]);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!uid) return;
    void garantirMeuPerfil({
      nome: user?.displayName ?? undefined,
      papel: isFabricaChatEmail(user?.email) ? 'fabrica' : 'estoque',
    }).catch(() => undefined);
  }, [uid, user?.displayName]);

  useEffect(() => {
    const stopPessoas = listenPessoas(setPessoas, (err) => setErro(err.message));
    const stopConv = uid
      ? listenMinhasConversas(uid, setConversas, (err) => setErro(err.message))
      : () => undefined;
    void listarRefsDesenv()
      .then(setRefs)
      .catch(() => setRefs([]));
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
    const stop = listenMsgs(ativa, setMsgs, (err) => setErro(err.message));
    void marcarLida(ativa, uid).catch(() => undefined);
    return () => stop();
  }, [ativa, uid]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length, ativa]);

  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas]);
  const outros = pessoas.filter((p) => p.id !== uid);
  const conversaAtiva = conversas.find((c) => c.id === ativa);
  const outro = conversaAtiva ? porId.get(outroUid(conversaAtiva, uid)) : undefined;

  async function escolherPessoa(id: string) {
    if (!uid || id === uid) return;
    setErro('');
    try {
      const cid = await abrirConversa(uid, id);
      setAtiva(cid);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para abrir a conversa.');
    }
  }

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    if (!uid || !ativa) return;
    setEnviando(true);
    setErro('');
    try {
      await enviarMsg({ conversa: ativa, de: uid, texto, ref });
      setTexto('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para enviar.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="msg-page">
      <aside className="msg-list card">
        <h1>Mensagens</h1>
        <p className="msg-hint">Só os dois da conversa veem. Não é mural.</p>
        <h2>Pessoas</h2>
        {outros.length === 0 ? (
          <p className="empty">Ninguém cadastrado ainda. Crie logins em Pessoas.</p>
        ) : (
          <ul>
            {outros.map((p) => {
              const cid = [uid, p.id].sort().join('__');
              const conv = conversas.find((c) => c.id === cid);
              const nova = conv ? conversaNaoLida(conv, uid) : false;
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    className={ativa === cid ? 'on' : ''}
                    onClick={() => void escolherPessoa(p.id)}
                  >
                    <strong>{p.nome}</strong>
                    <span>
                      {p.login}
                      {nova ? ' · nova' : ''}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </aside>
      <section className="msg-thread card">
        {ativa && outro ? (
          <>
            <header>
              <div>
                <h2>{outro.nome}</h2>
                <p>@{outro.login}</p>
              </div>
            </header>
            <div className="msg-feed">
              {msgs.map((m) => {
                const eu = m.de === uid;
                const autor = eu ? 'Você' : porId.get(m.de)?.nome ?? 'Alguém';
                return (
                  <article key={m.id} className={eu ? 'mine' : ''}>
                    <div className="meta">
                      {autor} · {hora(m.criado_em)}
                    </div>
                    {m.ref ? <div className="ref">Ref {m.ref}</div> : null}
                    <p>{m.texto}</p>
                  </article>
                );
              })}
              <div ref={bottomRef} />
            </div>
            {erro ? <div className="error-box">{erro}</div> : null}
            <form onSubmit={(e) => void handleSend(e)}>
              <div className="msg-ref">
                <label>Sobre o desenvolvimento (opcional)</label>
                <input
                  list="msg-refs"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="Ex.: 5612"
                />
                <datalist id="msg-refs">
                  {refs.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <textarea
                required
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                placeholder="Escreva só para esta pessoa…"
                rows={3}
              />
              <button type="submit" className="btn" disabled={enviando}>
                {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </form>
          </>
        ) : (
          <div className="empty">Escolha alguém à esquerda para conversar em particular.</div>
        )}
      </section>
      <style>{`
        .msg-page { display: grid; grid-template-columns: 280px 1fr; gap: 16px; min-height: calc(100vh - 48px); }
        .msg-list { padding: 18px 14px; overflow: auto; }
        .msg-list h1 { margin: 0 0 4px; font-size: 22px; }
        .msg-hint, .msg-list h2, .msg-thread header p { color: var(--muted); }
        .msg-hint { margin: 0 0 16px; font-size: 13px; }
        .msg-list h2 { margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
        .msg-list ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
        .msg-list button { width: 100%; text-align: left; background: transparent; border: 0; color: inherit; padding: 10px 10px; border-radius: 10px; display: flex; flex-direction: column; gap: 2px; }
        .msg-list button span { font-size: 12px; color: var(--muted); }
        .msg-list button:hover, .msg-list button.on { background: var(--accent-soft); }
        .msg-thread { display: flex; flex-direction: column; min-height: 0; }
        .msg-thread header { padding: 16px 18px 12px; border-bottom: 1px solid var(--border); }
        .msg-thread header h2 { margin: 0; }
        .msg-thread header p { margin: 2px 0 0; font-size: 13px; }
        .msg-feed { flex: 1; overflow: auto; padding: 16px 18px; display: flex; flex-direction: column; gap: 10px; }
        .msg-feed article { max-width: 78%; background: var(--inset); border: 1px solid var(--border); border-radius: 12px; padding: 8px 12px; }
        .msg-feed article.mine { margin-left: auto; background: var(--accent-soft); border-color: transparent; }
        .msg-feed .meta { font-size: 11px; color: var(--muted); }
        .msg-feed .ref { display: inline-block; margin: 4px 0; font-size: 12px; font-weight: 700; color: var(--accent); }
        .msg-feed p { margin: 4px 0 0; white-space: pre-wrap; }
        .msg-thread form { padding: 12px 18px 16px; border-top: 1px solid var(--border); display: grid; gap: 8px; }
        .msg-ref label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }
        @media (max-width: 760px) {
          .msg-page { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
