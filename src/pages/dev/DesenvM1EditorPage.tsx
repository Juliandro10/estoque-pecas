import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';

import {
  DEFAULT_M1_EDITOR_MODEL,
  DEFAULT_M1_EDITOR_SAIDA,
  M1_EDITOR_EFFORTS,
  M1_EDITOR_MODELS,
  normalizeM1EditorModel,
  normalizeM1EditorSaida,
  type M1EditorEffort,
  type M1EditorModelChoice,
  type M1EditorModelId,
  type M1EditorSaida,
} from '../../../shared/m1-editor-model';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsM1Editor,
  streamM1EditorChat,
  type M1EditorFile,
  type M1EditorMessage,
} from '../../lib/local-programs-api';

const SESSION_KEY = 'estoque-m1-editor-session';

function pickPreview(files: M1EditorFile[], current: string) {
  if (current && files.some((file) => file.name === current && file.image && !file.version)) return current;
  return files.find((file) => file.image && !file.version)?.name ?? '';
}

export function DesenvM1EditorPage() {
  const localMode = isLocalScannerAvailable();
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const [sessions, setSessions] = useState<{ id: string; title: string }[]>([]);
  const [reference, setReference] = useState('');
  const [model, setModel] = useState<M1EditorModelChoice>(DEFAULT_M1_EDITOR_MODEL);
  const [saida, setSaida] = useState<M1EditorSaida>(DEFAULT_M1_EDITOR_SAIDA);
  const [localReady, setLocalReady] = useState(false);
  const [localFallback, setLocalFallback] = useState(false);
  const [localMessage, setLocalMessage] = useState('');
  const [localModel, setLocalModel] = useState('');
  const [localModels, setLocalModels] = useState<string[]>([]);
  const [regras, setRegras] = useState('');
  const regrasRef = useRef('');
  const [messages, setMessages] = useState<M1EditorMessage[]>([]);
  const [files, setFiles] = useState<M1EditorFile[]>([]);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState('');
  const [running, setRunning] = useState(false);
  const [toolName, setToolName] = useState('');
  const [error, setError] = useState('');
  const threadRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const selectedRef = useRef('');
  const messagesRef = useRef<M1EditorMessage[]>([]);
  const modelRef = useRef(model);
  const saidaRef = useRef(saida);
  const chatAbortRef = useRef<AbortController | null>(null);
  const sendGen = useRef(0);

  const currentFiles = useMemo(() => files.filter((file) => !file.version), [files]);
  const versions = useMemo(() => files.filter((file) => file.version), [files]);
  const preview = files.find((file) => file.name === selected && file.image);

  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    saidaRef.current = saida;
  }, [saida]);

  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const timer = window.setTimeout(() => {
      void localProgramsApi.m1EditorUpdate(sessionId, { messages: messagesRef.current }).catch(() => undefined);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [messages, sessionId]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages, toolName, running]);

  async function openSession(id: string) {
    const data = await localProgramsApi.m1EditorSession(id);
    setSessionId(id);
    setReference(data.session.reference);
    setModel(normalizeM1EditorModel(data.session.model));
    setSaida(normalizeM1EditorSaida(data.session.saida));
    setMessages(data.session.messages);
    setFiles(data.files);
    setSelected((current) => pickPreview(data.files, current));
    localStorage.setItem(SESSION_KEY, id);
  }

  useEffect(() => {
    if (!localMode) return;
    let cancel = false;
    void (async () => {
      try {
        const health = await localProgramsApi.health();
        if (cancel) return;
        setScannerOk(true);
        const ok = scannerSupportsM1Editor(health);
        setSupported(ok);
        if (!ok) return;
        const status = await localProgramsApi.m1EditorStatus();
        if (cancel) return;
        setConfigured(status.configured);
        applyLocalStatus(status);
        const padrao = await localProgramsApi.m1EditorPadrao();
        if (!cancel) {
          regrasRef.current = padrao.regras;
          setRegras(padrao.regras);
        }
        const listed = await localProgramsApi.m1EditorSessions();
        if (cancel) return;
        setSessions(listed.sessions.map((row) => ({ id: row.id, title: row.title })));
        const saved = localStorage.getItem(SESSION_KEY);
        const known = listed.sessions.some((row) => row.id === saved);
        if (saved && known) await openSession(saved);
      } catch {
        if (!cancel) setScannerOk(false);
      }
    })();
    return () => {
      cancel = true;
    };
  }, [localMode]);

  useEffect(() => {
    if (!running || !sessionId) return;
    const timer = window.setInterval(() => {
      void localProgramsApi.m1EditorSession(sessionId).then((data) => {
        setFiles(data.files);
        setSelected((current) => pickPreview(data.files, current || selectedRef.current));
      }).catch(() => undefined);
    }, 2000);
    return () => window.clearInterval(timer);
  }, [running, sessionId]);

  async function newChat(nextReference = '') {
    setError('');
    const created = await localProgramsApi.m1EditorCreate(modelRef.current);
    const id = created.session.id;
    const savedReference = nextReference.trim();
    if (savedReference) await localProgramsApi.m1EditorUpdate(id, { reference: savedReference });
    setSessions((rows) => [{ id, title: created.session.title }, ...rows]);
    setSessionId(id);
    setReference(savedReference);
    setModel(normalizeM1EditorModel(created.session.model ?? modelRef.current));
    setMessages([]);
    setFiles(created.files);
    setSelected('');
    localStorage.setItem(SESSION_KEY, id);
    return id;
  }

  function agentId(value: string): M1EditorModelId {
    if (value === 'grok' || value === 'local') return value;
    return 'composer';
  }

  async function saveSaida(next: M1EditorSaida) {
    const choice = normalizeM1EditorSaida(next);
    setSaida(choice);
    if (!sessionId) return;
    try {
      await localProgramsApi.m1EditorUpdate(sessionId, { saida: choice });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para salvar a medida.');
    }
  }

  function applyLocalStatus(status: {
    local?: boolean;
    localFallback?: boolean;
    localMessage?: string;
    localModel?: string;
    localPreferred?: string;
    localModels?: string[];
  }) {
    setLocalReady(status.local === true);
    setLocalFallback(status.localFallback === true);
    setLocalMessage(status.localMessage?.trim() ?? '');
    const chosen = status.localPreferred?.trim() || status.localModel?.trim() || '';
    const installed = status.localModels ?? [];
    setLocalModels(chosen && !installed.includes(chosen) ? [chosen, ...installed] : installed);
    setLocalModel(chosen);
  }

  async function saveLocalModel(modelo: string) {
    setLocalModel(modelo);
    try {
      applyLocalStatus(await localProgramsApi.m1EditorSaveModelo(modelo));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para trocar o modelo local.');
    }
  }

  async function saveModel(next: M1EditorModelChoice) {
    const choice = normalizeM1EditorModel(next);
    setModel(choice);
    if (choice.id === 'local') {
      void localProgramsApi.m1EditorStatus().then(applyLocalStatus).catch(() => undefined);
    }
    if (!sessionId) return;
    try {
      await localProgramsApi.m1EditorUpdate(sessionId, { model: choice });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para salvar o agente.');
    }
  }

  async function onReferenceBlur() {
    const savedReference = reference.trim();
    if (!supported) return;
    try {
      if (!sessionId) {
        if (!savedReference) return;
        await newChat(savedReference);
        return;
      }
      await localProgramsApi.m1EditorUpdate(sessionId, { reference: savedReference });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para salvar a referência.');
    }
  }

  async function onUpload(list: FileList | null) {
    if (!list?.length) return;
    if (!sessionId) await newChat(reference);
    const id = localStorage.getItem(SESSION_KEY) ?? '';
    if (!id) return;
    setError('');
    try {
      let latest = files;
      for (const file of Array.from(list)) {
        if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name} passa de 40 MB.`);
        const saved = await localProgramsApi.m1EditorUpload(id, file);
        latest = saved.files;
      }
      setFiles(latest);
      setSelected(pickPreview(latest, selectedRef.current));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao anexar.');
    }
  }

  async function onSend(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message) return;
    chatAbortRef.current?.abort();
    const controller = new AbortController();
    chatAbortRef.current = controller;
    const gen = ++sendGen.current;
    let id = sessionId;
    if (!id) id = await newChat(reference);
    setDraft('');
    setError('');
    setRunning(true);
    setToolName('');
    setMessages((rows) => [...rows, { role: 'user', text: message, at: new Date().toISOString() }]);
    let assistant = '';
    const deliver = async () => {
      await streamM1EditorChat(id, message, modelRef.current, saidaRef.current, (item) => {
        if (item.type === 'text') {
          assistant += item.text;
          const text = assistant;
          setToolName('');
          setMessages((rows) => {
            const next = [...rows];
            const last = next[next.length - 1];
            if (last?.role === 'assistant') next[next.length - 1] = { ...last, text };
            else next.push({ role: 'assistant', text, at: new Date().toISOString() });
            return next;
          });
        } else if (item.type === 'tool') {
          setToolName(item.name);
        } else if (item.type === 'done') {
          setRunning(false);
          setToolName('');
          draftRef.current?.focus();
        } else if (item.type === 'error') {
          setError(item.error);
          setRunning(false);
          draftRef.current?.focus();
        }
      }, controller.signal);
    };
    try {
      try {
        await deliver();
      } catch (err) {
        const stuck = err instanceof Error && /ainda está respondendo/i.test(err.message);
        if (!stuck || sendGen.current !== gen) throw err;
        await new Promise((resolve) => window.setTimeout(resolve, 700));
        if (sendGen.current !== gen) return;
        await deliver();
      }
      if (sendGen.current !== gen) return;
      const data = await localProgramsApi.m1EditorSession(id);
      setMessages(data.session.messages);
      setFiles(data.files);
      setSelected(pickPreview(data.files, selectedRef.current));
      setSessions((rows) => rows.map((row) => (row.id === id ? { ...row, title: data.session.title } : row)));
    } catch (err) {
      if (sendGen.current !== gen) return;
      setError(err instanceof Error ? err.message : 'Erro no editor.');
    } finally {
      if (sendGen.current !== gen) return;
      setRunning(false);
      setToolName('');
      if (id) {
        void localProgramsApi.m1EditorUpdate(id, { messages: messagesRef.current }).catch(() => undefined);
      }
      draftRef.current?.focus();
    }
  }

  return (
    <div className="m1-editor">
      {!localMode && <p className="error-box">Abra pelo Iniciar.bat neste computador para usar o editor.</p>}
      {localMode && scannerOk === false && <p className="error-box">Scanner local offline. Abra o Iniciar.bat.</p>}
      {localMode && scannerOk && !supported && (
        <p className="error-box">Reinicie o Iniciar.bat para carregar o editor.</p>
      )}
      {supported && !configured && (
        <p className="error-box">
          Falta a chave CURSOR_API_KEY no .env. Crie em Cursor Dashboard → API Keys, cole no .env e reinicie o scanner.
        </p>
      )}

      <div className="editor-grid">
        <section className="card editor-chat">
          <div className="editor-bar">
            <select
              value={sessionId}
              onChange={(event) => {
                const id = event.target.value;
                if (id) void openSession(id).catch((err) => setError(err instanceof Error ? err.message : 'Erro.'));
              }}
            >
              <option value="">Conversa</option>
              {sessions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.title}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void newChat()} disabled={!supported}>
              Nova
            </button>
          </div>
          <label className="editor-ref">
            Referência do modelo
            <input
              value={reference}
              onChange={(event) => setReference(event.target.value)}
              onBlur={() => void onReferenceBlur()}
              placeholder="5534"
              disabled={!supported}
            />
            <span>Liga esta arte à peça. O editor usa esse número no pedido.</span>
          </label>
          <div className="editor-thread" ref={threadRef}>
            {messages.length === 0 && (
              <p className="editor-hint">
                Anexe a ficha e escreva o pedido como no Cursor. PDF, Photoshop, Illustrator e HTML entram aqui. A saída da máquina é BMP.
              </p>
            )}
            {messages.map((row, index) => (
              <article key={`${row.at}-${index}`} className={row.role === 'user' ? 'bubble user' : 'bubble'}>
                {row.text}
              </article>
            ))}
            {running && <p className="editor-hint">{toolName ? `Usando ${toolName}…` : 'Editando…'}</p>}
          </div>
          {error && <p className="error-box">{error}</p>}
          <form onSubmit={(event) => void onSend(event)} className="editor-form">
            <textarea
              ref={draftRef}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Descreva a edição"
              disabled={!supported || (!configured && !localReady)}
            />
            <div className="editor-model">
              <select
                aria-label="Agente"
                value={model.id}
                disabled={!supported || (!configured && !localReady)}
                onChange={(event) => void saveModel({ ...model, id: agentId(event.target.value) })}
              >
                {M1_EDITOR_MODELS.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.label}
                  </option>
                ))}
              </select>
              {model.id === 'local' && (
                <select
                  aria-label="Modelo local"
                  value={localModel}
                  disabled={!supported || localModels.length === 0}
                  onChange={(event) => void saveLocalModel(event.target.value)}
                >
                  {localModels.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              )}
              {model.id === 'grok' && (
                <select
                  aria-label="Esforço"
                  value={model.effort}
                  disabled={!supported || !configured}
                  onChange={(event) => void saveModel({ ...model, effort: event.target.value as M1EditorEffort })}
                >
                  {M1_EDITOR_EFFORTS.map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.label}
                    </option>
                  ))}
                </select>
              )}
              {model.id !== 'local' && (
                <select
                  aria-label="Velocidade"
                  value={model.fast ? 'fast' : 'normal'}
                  disabled={!supported || !configured}
                  onChange={(event) => void saveModel({ ...model, fast: event.target.value === 'fast' })}
                >
                  <option value="fast">Rápido</option>
                  <option value="normal">Normal</option>
                </select>
              )}
            </div>
            <div className="editor-spec">
              <label>
                Largura
                <input
                  aria-label="Largura"
                  type="number"
                  min={16}
                  max={2000}
                  value={saida.largura}
                  disabled={!supported}
                  onChange={(event) => {
                    const next = { ...saidaRef.current, largura: Number(event.target.value) };
                    saidaRef.current = next;
                    setSaida(next);
                  }}
                  onBlur={() => void saveSaida(saidaRef.current)}
                />
              </label>
              <label>
                Altura
                <input
                  aria-label="Altura"
                  type="number"
                  min={16}
                  max={2000}
                  value={saida.altura}
                  disabled={!supported}
                  onChange={(event) => {
                    const next = { ...saidaRef.current, altura: Number(event.target.value) };
                    saidaRef.current = next;
                    setSaida(next);
                  }}
                  onBlur={() => void saveSaida(saidaRef.current)}
                />
              </label>
              <label>
                Cores
                <input
                  aria-label="Cores"
                  type="number"
                  min={2}
                  max={8}
                  value={saida.cores}
                  disabled={!supported}
                  onChange={(event) => {
                    const next = { ...saidaRef.current, cores: Number(event.target.value) };
                    saidaRef.current = next;
                    setSaida(next);
                  }}
                  onBlur={() => void saveSaida(saidaRef.current)}
                />
              </label>
            </div>
            <label className="editor-regras">
              Parâmetros
              <textarea
                aria-label="Parâmetros do agente"
                value={regras}
                disabled={!supported}
                onChange={(event) => {
                  regrasRef.current = event.target.value;
                  setRegras(event.target.value);
                }}
                onBlur={() => {
                  void localProgramsApi.m1EditorSavePadrao(regrasRef.current).catch((err) => {
                    setError(err instanceof Error ? err.message : 'Não deu para salvar os parâmetros.');
                  });
                }}
              />
              <span>Fica gravado como padrão. O agente segue isso em todas as conversas.</span>
            </label>
            {model.id === 'local' && (
              <p className={!localReady || localFallback ? 'editor-local-warn' : 'editor-hint'}>
                {localMessage ||
                  (localReady
                    ? 'Local neste PC, sem API. A resposta demora mais que o Composer.'
                    : 'O modelo local ainda está sendo preparado neste PC.')}
              </p>
            )}
            <div className="editor-actions">
              <label className="btn btn-ghost btn-sm">
                Anexar
                <input
                  type="file"
                  multiple
                  hidden
                  disabled={!supported || running}
                  onChange={(event) => {
                    void onUpload(event.target.files);
                    event.target.value = '';
                  }}
                />
              </label>
              <button
                type="submit"
                className="btn btn-sm"
                disabled={!supported || !draft.trim() || (model.id === 'local' ? !localReady : !configured)}
              >
                Enviar
              </button>
            </div>
          </form>
        </section>

        <section className="card editor-stage">
          {preview ? (
            <img src={`${preview.url}&preview=1`} alt={preview.name} />
          ) : (
            <p className="editor-hint">A imagem aparece aqui.</p>
          )}
          {preview && (
            <a className="editor-download" href={preview.url} download>
              Baixar {preview.name.split('/').pop()}
            </a>
          )}
          <ul className="editor-files">
            {currentFiles.map((file) => (
              <li key={file.name}>
                <button
                  type="button"
                  className={file.name === selected ? 'active' : ''}
                  onClick={() => file.image && setSelected(file.name)}
                >
                  {file.name.replace(/^arquivos\//, '')}
                </button>
              </li>
            ))}
          </ul>
          {versions.length > 0 && (
            <details>
              <summary>Versões anteriores ({versions.length})</summary>
              <ul className="editor-files">
                {versions.map((file) => (
                  <li key={file.name}>
                    <button type="button" onClick={() => file.image && setSelected(file.name)}>
                      {file.name.replace(/^versoes\//, '')}
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </section>
      </div>

      <style>{`
        .m1-editor {
          display: flex;
          flex-direction: column;
          gap: 12px;
          height: calc(100vh - 148px);
          min-height: 420px;
          overflow: hidden;
        }
        .editor-grid {
          flex: 1;
          min-height: 0;
          display: grid;
          grid-template-columns: minmax(300px, 420px) minmax(0, 1fr);
          gap: 16px;
          overflow: hidden;
        }
        .editor-chat, .editor-stage {
          display: flex;
          flex-direction: column;
          gap: 10px;
          padding: 14px;
          min-width: 0;
          min-height: 0;
          overflow: hidden;
        }
        .editor-bar { display: flex; gap: 8px; flex: 0 0 auto; }
        .editor-bar select { flex: 1; }
        .editor-ref { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); flex: 0 0 auto; }
        .editor-ref span { font-size: 11px; line-height: 1.3; }
        .editor-thread {
          flex: 1 1 auto;
          min-height: 0;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          gap: 8px;
          padding-right: 4px;
        }
        .bubble { white-space: pre-wrap; padding: 10px 12px; border-radius: 12px; background: var(--inset); }
        .bubble.user { background: var(--accent-soft); }
        .editor-hint { margin: 0; color: var(--muted); font-size: 13px; }
        .editor-local-warn { margin: 0; padding: 10px 12px; border-radius: 10px; background: rgba(248, 113, 113, 0.12); color: var(--danger); font-size: 13px; }
        .editor-form { flex: 0 0 auto; display: flex; flex-direction: column; gap: 8px; }
        .editor-form textarea { min-height: 72px; max-height: 140px; }
        .editor-model { display: flex; flex-wrap: wrap; gap: 6px; }
        .editor-model select { width: auto; flex: 1 1 88px; min-width: 0; padding: 8px; font-size: 13px; }
        .editor-spec { display: flex; gap: 8px; }
        .editor-spec label { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
        .editor-spec input { width: 100%; padding: 8px; font-size: 14px; }
        .editor-regras { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
        .editor-regras textarea { min-height: 72px; max-height: 120px; font-size: 13px; }
        .editor-regras span { font-size: 11px; line-height: 1.3; }
        .editor-actions { display: flex; justify-content: space-between; gap: 8px; }
        .editor-actions .btn { width: auto; }
        .editor-stage img {
          flex: 1 1 auto;
          min-height: 0;
          width: 100%;
          object-fit: contain;
          background: #1e293b;
          border-radius: 10px;
        }
        .editor-download { color: var(--accent); font-size: 13px; font-weight: 700; flex: 0 0 auto; }
        .editor-files { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; max-height: 28%; overflow: auto; flex: 0 1 auto; }
        .editor-files button { width: 100%; text-align: left; background: transparent; color: var(--muted); border: 0; padding: 4px 2px; font-weight: 600; }
        .editor-files button.active { color: var(--accent); }
        .editor-stage summary { cursor: pointer; color: var(--muted); font-size: 13px; }
        @media (max-width: 900px) {
          .m1-editor { height: auto; overflow: visible; }
          .editor-grid { grid-template-columns: 1fr; overflow: visible; }
          .editor-chat, .editor-stage { overflow: visible; }
          .editor-thread { max-height: 55vh; }
        }
      `}</style>
    </div>
  );
}
