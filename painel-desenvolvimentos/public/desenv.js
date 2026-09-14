const STATUS = [
  { id: 'estilo', label: 'Desenv/estilo' },
  { id: 'modelagem', label: 'Modelagem' },
  { id: 'programacao', label: 'Programação' },
  { id: 'costura', label: 'Costura e acabamento' },
  { id: 'cliente', label: 'Envie ao cliente' },
];

const NEXT = {
  estilo: 'modelagem',
  modelagem: 'programacao',
  programacao: 'costura',
  costura: 'cliente',
};

const PREV = {
  modelagem: 'estilo',
  programacao: 'modelagem',
  costura: 'programacao',
  cliente: 'costura',
};

const OK_LABEL = {
  estilo: 'OK · Modelagem',
  modelagem: 'OK · Programação',
  programacao: 'OK · Costura',
  costura: 'OK · Envie ao cliente',
};

const TIPOS = [
  { id: 'novo', label: 'Modelo novo' },
  { id: 'ajuste', label: 'Ajuste' },
  { id: 'peca_foto', label: 'Peça foto' },
  { id: 'show_room', label: 'Show room' },
  { id: 'outro', label: 'Outro' },
];

const COL = 'desenvolvimentos';
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const abasEl = document.getElementById('abas');
const listaEl = document.getElementById('lista');
const avisoEl = document.getElementById('aviso');
const resumoEl = document.getElementById('resumo');
const dlg = document.getElementById('dlg');
const form = document.getElementById('dlg-form');
const tipoSel = document.getElementById('f-tipo');
const setorSel = document.getElementById('f-setor');
const tipoOutroWrap = document.getElementById('f-tipo-outro-wrap');
const refHintEl = document.getElementById('f-ref-hint');
const dlgSyn = document.getElementById('dlg-syntech');
const synLista = document.getElementById('syn-lista');
const synBusca = document.getElementById('syn-busca');
const synErro = document.getElementById('syn-erro');
const btnSyntech = document.getElementById('btn-syntech');

let syntechOk = false;
let syntechItens = [];
let syntechBusy = false;
let syntechTimer = 0;
let syntechCatalog = {};
let refTimer = 0;
let suggestedTipo = 'novo';

let db = null;
let auth = null;
let editingId = null;
let items = [];
let unsub = null;
let unsubCatalog = null;
let activeTab = sessionStorage.getItem('desenv-aba') || 'estilo';
let didPickTab = false;

function pickTabAfterLoad() {
  if (didPickTab) return;
  didPickTab = true;
  const saved = sessionStorage.getItem('desenv-aba');
  if (saved && items.some((item) => inTab(item, saved))) {
    activeTab = saved;
    return;
  }
  const busy = STATUS.find((tab) => items.some((item) => inTab(item, tab.id)));
  activeTab = busy?.id || saved || 'estilo';
  sessionStorage.setItem('desenv-aba', activeTab);
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function normalizeStatus(id) {
  if (id === 'ficha') return 'estilo';
  if (STATUS.some((s) => s.id === id) || id === 'encerrado') return id;
  return 'estilo';
}

function statusLabel(id) {
  const norm = normalizeStatus(id);
  if (norm === 'encerrado') return 'Encerrado';
  return STATUS.find((s) => s.id === norm)?.label ?? id;
}

function tipoLabel(item) {
  const id = item?.tipo || 'novo';
  if (id === 'ajuste') {
    const n = Number(item.ajuste_n) || 0;
    return n > 1 ? `Ajuste nº ${n}` : n === 1 ? 'Ajuste nº 1' : 'Ajuste';
  }
  if (id === 'outro') return (item.tipo_texto || '').trim() || 'Outro';
  return TIPOS.find((t) => t.id === id)?.label ?? id;
}

function refOf(item) {
  return String(item?.syntech_codigo ?? item?.referencia ?? '').trim();
}

function sameRef(item, codigo) {
  const left = refOf(item);
  const right = String(codigo ?? '').trim();
  return Boolean(left) && left === right;
}

function isActive(item) {
  return normalizeStatus(item.status) !== 'encerrado';
}

function inTab(item, tab) {
  return normalizeStatus(item.status) === tab;
}

function prioOf(item) {
  const n = Number(item.prioridade);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

function orderedIn(tab) {
  return items
    .filter((item) => inTab(item, tab))
    .sort((a, b) => {
      const d = prioOf(a) - prioOf(b);
      if (d) return d;
      return String(a.criado_em || '').localeCompare(String(b.criado_em || ''));
    });
}

function nextPrioridade(status) {
  const same = orderedIn(status);
  return same.reduce((n, item) => Math.max(n, Number(item.prioridade) || 0), 0) + 1;
}

async function writeOrdem(ordered) {
  const now = new Date().toISOString();
  const batch = db.batch();
  let writes = 0;
  ordered.forEach((item, i) => {
    const prio = i + 1;
    if (Number(item.prioridade) !== prio) {
      batch.update(db.collection(COL).doc(item.id), { prioridade: prio, atualizado_em: now });
      writes += 1;
    }
  });
  if (writes) await batch.commit();
}

function showAviso(text) {
  avisoEl.hidden = !text;
  avisoEl.textContent = text || '';
}

function fillTipos(selected) {
  tipoSel.innerHTML = TIPOS.map(
    (t) => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.label)}</option>`
  ).join('');
  tipoOutroWrap.hidden = selected !== 'outro';
}

function fillSetores(selected) {
  const cur = normalizeStatus(selected);
  const opts = [...STATUS];
  if (cur === 'encerrado') opts.push({ id: 'encerrado', label: 'Encerrado' });
  setorSel.innerHTML = opts
    .map((s) => `<option value="${esc(s.id)}"${s.id === cur ? ' selected' : ''}>${esc(s.label)}</option>`)
    .join('');
}

function who() {
  return auth.currentUser?.email ?? '';
}

function pushHist(item, acao, de, para) {
  const hist = Array.isArray(item?.historico) ? [...item.historico] : [];
  hist.push({
    em: new Date().toISOString(),
    acao,
    de: de || '',
    para: para || '',
    por: who(),
  });
  return hist.slice(-24);
}

function ativoComRef(codigo) {
  if (!String(codigo ?? '').trim()) return null;
  return items.find((item) => isActive(item) && sameRef(item, codigo)) ?? null;
}

function historicoDaRef(codigo) {
  if (!String(codigo ?? '').trim()) return [];
  return items.filter((item) => sameRef(item, codigo));
}

function cadastradoDaRef(codigo) {
  const hist = historicoDaRef(codigo);
  if (!hist.length) return null;
  const last = [...hist].sort((a, b) =>
    String(b.atualizado_em || b.criado_em || '').localeCompare(String(a.atualizado_em || a.criado_em || ''))
  )[0];
  return {
    nome: String(last?.nome ?? '').trim(),
    cliente: String(last?.cliente ?? '').trim(),
  };
}

function modeloExistenteHint(nome, cliente) {
  const partes = [];
  if (nome) partes.push(nome);
  if (cliente) partes.push(`Cliente: ${cliente}`);
  return partes.length
    ? `Modelo existente: ${partes.join(' · ')}. Confira se está certo.`
    : 'Modelo existente. Confira nome e cliente.';
}

function fillNomeCliente(nome, cliente) {
  const nomeEl = document.getElementById('f-nome');
  const clienteEl = document.getElementById('f-cliente');
  if (!nomeEl.value.trim() && nome) nomeEl.value = nome;
  if (!clienteEl.value.trim() && cliente) clienteEl.value = cliente;
}

async function lookupProdutoApi(codigo) {
  const ref = String(codigo ?? '').trim();
  if (!ref) return null;
  try {
    const res = await fetch(`/api/programs/desenv-produto?codigo=${encodeURIComponent(ref)}`);
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || typeof data !== 'object' || typeof data.existe !== 'boolean') return null;
    return data;
  } catch {
    return null;
  }
}

function lookupProdutoCatalog(codigo) {
  const ref = String(codigo ?? '').trim();
  if (!ref) return null;
  const hit = syntechCatalog[ref];
  if (!hit || typeof hit !== 'object') return null;
  return {
    existe: true,
    codigo: ref,
    nome: String(hit.nome ?? '').trim(),
    cliente: String(hit.cliente ?? '').trim(),
    tem_programa: Boolean(hit.tem_programa),
  };
}

async function lookupProduto(codigo) {
  const api = await lookupProdutoApi(codigo);
  if (api?.existe) return api;
  const cached = lookupProdutoCatalog(codigo);
  if (cached) return cached;
  return api;
}

function applySuggestedTipo(id, hint, existente = false) {
  suggestedTipo = id;
  const locked = tipoSel.value === 'peca_foto' || tipoSel.value === 'show_room' || tipoSel.value === 'outro';
  if (!locked) {
    tipoSel.value = id;
    tipoOutroWrap.hidden = id !== 'outro';
  }
  refHintEl.textContent = hint;
  refHintEl.classList.toggle('existente', existente);
}

async function refreshRefHint() {
  const ref = document.getElementById('f-ref').value.trim();
  if (editingId) {
    refHintEl.textContent = '';
    refHintEl.classList.remove('existente');
    return;
  }
  if (!ref) {
    applySuggestedTipo('novo', 'Sem referência ainda: sugere modelo novo.');
    return;
  }

  const ativo = ativoComRef(ref);
  if (ativo && ativo.id !== editingId) {
    fillNomeCliente(ativo.nome, ativo.cliente);
    applySuggestedTipo(
      'ajuste',
      `Essa referência já está em ${statusLabel(ativo.status)}. ${modeloExistenteHint(ativo.nome, ativo.cliente)} Não lança outro card — edite o da fila, ou encerre antes.`,
      true
    );
    return;
  }

  const visto = cadastradoDaRef(ref);
  const syn = await lookupProduto(ref);
  if (document.getElementById('f-ref').value.trim() !== ref) return;

  const nome = String(syn?.nome ?? '').trim() || visto?.nome || '';
  const cliente = String(syn?.cliente ?? '').trim() || visto?.cliente || '';
  const existe = Boolean(syn?.existe || visto);

  if (existe) {
    fillNomeCliente(nome, cliente);
    if (syn?.tem_programa || visto) {
      applySuggestedTipo('ajuste', modeloExistenteHint(nome, cliente), true);
      return;
    }
    applySuggestedTipo(
      'novo',
      `${modeloExistenteHint(nome, cliente)} Ainda sem programa: sugere modelo novo.`,
      true
    );
    return;
  }

  applySuggestedTipo(
    'novo',
    syntechOk
      ? 'Não achei essa referência no Syntech: sugere modelo novo.'
      : Object.keys(syntechCatalog).length
        ? 'Não achei essa referência no cadastro. Confira o código, ou preencha o nome.'
        : 'Referência nova na nossa fila: sugere modelo novo.'
  );
}

function openDialog(item) {
  editingId = item?.id ?? null;
  document.getElementById('dlg-title').textContent = editingId ? 'Editar desenvolvimento' : 'Novo desenvolvimento';
  document.getElementById('f-ref').value = item ? refOf(item) : '';
  document.getElementById('f-nome').value = item?.nome ?? '';
  document.getElementById('f-cliente').value = item?.cliente ?? '';
  document.getElementById('f-obs').value = item?.obs ?? '';
  document.getElementById('f-tipo-texto').value = item?.tipo_texto ?? '';
  document.getElementById('dlg-erro').textContent = '';
  fillTipos(item?.tipo || 'novo');
  fillSetores(item?.status || 'estilo');
  suggestedTipo = item?.tipo || 'novo';
  refHintEl.textContent = '';
  refHintEl.classList.remove('existente');
  dlg.hidden = false;
  if (editingId) document.getElementById('f-nome').focus();
  else {
    document.getElementById('f-ref').focus();
    void refreshRefHint();
  }
}

function closeDialog() {
  dlg.hidden = true;
  editingId = null;
}

function renderAbas() {
  const tabs = [...STATUS, { id: 'encerrado', label: 'Encerrados' }];
  abasEl.innerHTML = tabs
    .map((tab) => {
      const n = items.filter((item) => inTab(item, tab.id)).length;
      const on = activeTab === tab.id ? ' on' : '';
      return `<button type="button" class="aba${on}" data-tab="${esc(tab.id)}">${esc(tab.label)}<span class="n">${n}</span></button>`;
    })
    .join('');
}

function render() {
  if (!STATUS.some((s) => s.id === activeTab) && activeTab !== 'encerrado') activeTab = 'estilo';
  renderAbas();
  const ordered = orderedIn(activeTab);
  const tabName = statusLabel(activeTab);
  resumoEl.textContent =
    activeTab === 'encerrado'
      ? `${ordered.length} encerrado(s)`
      : ordered.length
        ? `${ordered.length} em ${tabName} · OK manda para o próximo setor`
        : `Nada em ${tabName}`;

  if (!ordered.length) {
    const outros = STATUS.filter((s) => s.id !== activeTab).reduce(
      (n, s) => n + items.filter((item) => inTab(item, s.id)).length,
      0
    );
    let empty = 'Nenhum modelo neste setor. Lance um novo ou dê OK na aba anterior.';
    if (activeTab === 'encerrado') empty = 'Nenhum modelo encerrado.';
    else if (outros > 0) {
      empty = `Nenhum modelo neste setor. Há ${outros} em outra aba — clique nela para dar OK, ou lance um novo.`;
    }
    listaEl.innerHTML = `<p class="empty">${empty}</p>`;
    return;
  }

  listaEl.innerHTML = ordered
    .map((item, index) => {
      const cliente = item.cliente ? esc(item.cliente) : 'sem cliente';
      const obs = item.obs ? `<div class="meta">${esc(item.obs)}</div>` : '';
      const status = normalizeStatus(item.status);
      const voltarBtn = PREV[status]
        ? `<button type="button" class="btn ghost sm" data-act="voltar-setor">Voltar setor</button>`
        : '';
      const okBtn =
        status === 'cliente'
          ? `${voltarBtn}
             <button type="button" class="btn warn sm" data-act="voltar">Voltou</button>
             <button type="button" class="btn ghost sm" data-act="encerrar">Encerrar</button>`
          : status === 'encerrado'
            ? ''
            : `${voltarBtn}<button type="button" class="btn go sm" data-act="ok">${esc(OK_LABEL[status] || 'OK')}</button>`;
      return `<article class="card" data-id="${esc(item.id)}">
        <div class="prio">${index + 1}</div>
        <div>
          <div class="nome">${refOf(item) ? `<span class="ref-tag">${esc(refOf(item))}</span>` : ''}${esc(item.nome)}</div>
          <div class="meta">${cliente}</div>
          <div class="selos">
            <span class="selo tipo">${esc(tipoLabel(item))}</span>
          </div>
          ${obs}
        </div>
        <div class="acoes">
          ${okBtn}
          <button type="button" class="btn ghost sm" data-act="up" ${index === 0 ? 'disabled' : ''}>Subir</button>
          <button type="button" class="btn ghost sm" data-act="down" ${index === ordered.length - 1 ? 'disabled' : ''}>Descer</button>
          <button type="button" class="btn ghost sm" data-act="edit">Editar</button>
        </div>
      </article>`;
    })
    .join('');
}

async function saveItem(payload) {
  const now = new Date().toISOString();
  const email = who();
  if (editingId) {
    await db.collection(COL).doc(editingId).update({
      ...payload,
      atualizado_em: now,
    });
    return;
  }
  const status = payload.status || 'estilo';
  await db.collection(COL).add({
    ...payload,
    status,
    prioridade: nextPrioridade(status),
    historico: [
      {
        em: now,
        acao: 'lancou',
        de: '',
        para: status,
        por: email,
      },
    ],
    criado_em: now,
    atualizado_em: now,
    criado_por: email,
  });
}

async function move(id, dir) {
  const ordered = orderedIn(activeTab);
  const from = ordered.findIndex((item) => item.id === id);
  const to = from + dir;
  if (from < 0 || to < 0 || to >= ordered.length) return;
  const next = [...ordered];
  const [row] = next.splice(from, 1);
  next.splice(to, 0, row);
  await writeOrdem(next);
}

async function avancar(item) {
  const de = normalizeStatus(item.status);
  const para = NEXT[de];
  if (!para) return;
  await db.collection(COL).doc(item.id).update({
    status: para,
    prioridade: nextPrioridade(para),
    historico: pushHist(item, 'ok', de, para),
    atualizado_em: new Date().toISOString(),
  });
}

async function voltarSetor(item) {
  const de = normalizeStatus(item.status);
  const para = PREV[de];
  if (!para) return;
  await db.collection(COL).doc(item.id).update({
    status: para,
    prioridade: nextPrioridade(para),
    historico: pushHist(item, 'voltar', de, para),
    atualizado_em: new Date().toISOString(),
  });
  activeTab = para;
  sessionStorage.setItem('desenv-aba', activeTab);
}

async function voltouCliente(item) {
  const n = (Number(item.ajuste_n) || 0) + 1;
  await db.collection(COL).doc(item.id).update({
    status: 'programacao',
    tipo: 'ajuste',
    ajuste_n: n,
    prioridade: nextPrioridade('programacao'),
    historico: pushHist(item, 'voltou', 'cliente', 'programacao'),
    atualizado_em: new Date().toISOString(),
  });
  activeTab = 'programacao';
  sessionStorage.setItem('desenv-aba', activeTab);
}

async function encerrar(item) {
  const de = normalizeStatus(item.status);
  await db.collection(COL).doc(item.id).update({
    status: 'encerrado',
    prioridade: nextPrioridade('encerrado'),
    historico: pushHist(item, 'encerrar', de, 'encerrado'),
    atualizado_em: new Date().toISOString(),
  });
}

function listenCatalog() {
  if (unsubCatalog) unsubCatalog();
  unsubCatalog = db.collection('syntech_catalog').doc('produtos').onSnapshot(
    (snap) => {
      try {
        const raw = snap.data()?.json;
        syntechCatalog = raw && typeof raw === 'string' ? JSON.parse(raw) : {};
        if (!syntechCatalog || typeof syntechCatalog !== 'object') syntechCatalog = {};
      } catch {
        syntechCatalog = {};
      }
    },
    () => {
      syntechCatalog = {};
    }
  );
}

function listen() {
  if (unsub) unsub();
  unsub = db.collection(COL).onSnapshot(
    (snap) => {
      items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      pickTabAfterLoad();
      render();
      if (!dlgSyn.hidden) renderSyntech();
      showAviso('');
    },
    (err) => {
      showAviso(err.message || 'Não deu para ler a fila na nuvem.');
    }
  );
  listenCatalog();
}

function jaNaFila(codigo) {
  return Boolean(ativoComRef(codigo));
}

function formatCadastro(iso) {
  if (!iso || iso.length < 10) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function renderSyntech() {
  if (!syntechItens.length) {
    synLista.innerHTML = '<p class="empty">Nenhum produto pendente com esse filtro.</p>';
    return;
  }
  synLista.innerHTML = syntechItens
    .map((row) => {
      const naFila = jaNaFila(row.codigo);
      const quando = formatCadastro(row.cadastro);
      const meta = [row.grupo, quando].filter(Boolean).join(' · ');
      return `<article class="syn-row" data-codigo="${esc(row.codigo)}">
        <div class="syn-cod">${esc(row.codigo)}</div>
        <div>
          <div class="nome">${esc(row.nome)}</div>
          <div class="meta">${esc(meta)}</div>
        </div>
        <button type="button" class="btn sm ${naFila ? 'ghost' : 'go'}" data-act="add" ${naFila ? 'disabled' : ''}>
          ${naFila ? 'Já na fila' : 'Incluir na fila'}
        </button>
      </article>`;
    })
    .join('');
}

async function loadSyntech(busca) {
  synErro.textContent = '';
  synLista.innerHTML = '<p class="empty">Buscando no Syntech…</p>';
  try {
    const q = busca ? `?q=${encodeURIComponent(busca)}` : '';
    const res = await fetch(`/api/programs/desenv-pendentes${q}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não deu para ler o Syntech.');
    syntechItens = Array.isArray(data.itens) ? data.itens : [];
    renderSyntech();
  } catch (err) {
    syntechItens = [];
    synLista.innerHTML = '';
    synErro.textContent = err instanceof Error ? err.message : 'Não deu para ler o Syntech.';
  }
}

async function probeSyntech() {
  try {
    const res = await fetch('/api/programs/desenv-pendentes');
    const data = await res.json();
    syntechOk = res.ok && Array.isArray(data.itens);
  } catch {
    syntechOk = false;
  }
  btnSyntech.hidden = !syntechOk;
}

async function addFromSyntech(codigo) {
  const row = syntechItens.find((item) => item.codigo === codigo);
  if (!row || jaNaFila(codigo) || syntechBusy) return;
  syntechBusy = true;
  synErro.textContent = '';
  try {
    editingId = null;
    const visto = historicoDaRef(row.codigo);
    await saveItem({
      nome: row.nome,
      cliente: row.cliente || '',
      status: 'programacao',
      tipo: visto.length ? 'ajuste' : 'novo',
      tipo_texto: '',
      ajuste_n: visto.length ? 1 : 0,
      obs: row.grupo ? `Syntech ${row.codigo} · ${row.grupo}` : `Syntech ${row.codigo}`,
      syntech_codigo: row.codigo,
      referencia: row.codigo,
    });
    activeTab = 'programacao';
    sessionStorage.setItem('desenv-aba', activeTab);
    renderSyntech();
  } catch (err) {
    synErro.textContent = err instanceof Error ? err.message : 'Não deu para incluir na fila.';
  } finally {
    syntechBusy = false;
  }
}

function inIframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

const DESENV_LOGIN_USER = 'desenvolvimento';
const DESENV_LOGIN_EMAIL = 'desenvolvimentos@controle-tricot-e-cia.web.app';

function resolveLogin(value) {
  const raw = (value ?? '').trim().toLowerCase();
  if (
    raw === DESENV_LOGIN_USER ||
    raw === 'desenv' ||
    raw === 'desenvolvimentos' ||
    raw === DESENV_LOGIN_EMAIL
  ) {
    return DESENV_LOGIN_EMAIL;
  }
  return (value ?? '').trim();
}

function showApp(user) {
  loginEl.hidden = true;
  appEl.hidden = false;
  const email = (user.email ?? '').trim().toLowerCase();
  document.getElementById('user-email').textContent =
    email === DESENV_LOGIN_EMAIL ? DESENV_LOGIN_USER : user.email ?? '';
  document.getElementById('btn-sair').hidden = inIframe();
  listen();
  void probeSyntech();
}

function showLogin() {
  if (unsub) unsub();
  unsub = null;
  if (unsubCatalog) unsubCatalog();
  unsubCatalog = null;
  syntechCatalog = {};
  appEl.hidden = true;
  loginEl.hidden = false;
}

function boot() {
  const cfg = window.DESENV_FIREBASE;
  if (!cfg?.apiKey || !cfg?.projectId) {
    showAviso('Falta a configuração da nuvem neste PC.');
    appEl.hidden = false;
    loginEl.hidden = true;
    return;
  }
  fillTipos('novo');
  firebase.initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain || `${cfg.projectId}.firebaseapp.com`,
    projectId: cfg.projectId,
  });
  auth = firebase.auth();
  db = firebase.firestore();
  auth.onAuthStateChanged((user) => {
    if (user) showApp(user);
    else showLogin();
  });
}

document.getElementById('login-form').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById('login-erro');
  erro.textContent = '';
  try {
    await auth.signInWithEmailAndPassword(
      resolveLogin(document.getElementById('login-email').value),
      document.getElementById('login-pass').value
    );
  } catch {
    erro.textContent = 'Usuário ou senha incorretos.';
  }
});

document.getElementById('btn-sair').addEventListener('click', () => {
  void auth.signOut();
});
document.getElementById('btn-novo').addEventListener('click', () => openDialog(null));
document.getElementById('btn-syntech').addEventListener('click', () => {
  dlgSyn.hidden = false;
  synBusca.value = '';
  void loadSyntech('');
  synBusca.focus();
});
document.getElementById('syn-fechar').addEventListener('click', () => {
  dlgSyn.hidden = true;
});
dlgSyn.addEventListener('click', (ev) => {
  if (ev.target === dlgSyn) dlgSyn.hidden = true;
});
synBusca.addEventListener('input', () => {
  window.clearTimeout(syntechTimer);
  syntechTimer = window.setTimeout(() => void loadSyntech(synBusca.value.trim()), 280);
});
synLista.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act="add"]');
  const row = ev.target.closest('.syn-row');
  if (!btn || !row) return;
  void addFromSyntech(row.dataset.codigo);
});
document.getElementById('dlg-cancelar').addEventListener('click', closeDialog);
dlg.addEventListener('click', (ev) => {
  if (ev.target === dlg) closeDialog();
});
tipoSel.addEventListener('change', () => {
  tipoOutroWrap.hidden = tipoSel.value !== 'outro';
});
document.getElementById('f-ref').addEventListener('input', () => {
  window.clearTimeout(refTimer);
  refTimer = window.setTimeout(() => void refreshRefHint(), 280);
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById('dlg-erro');
  erro.textContent = '';
  const nome = document.getElementById('f-nome').value.trim();
  const ref = document.getElementById('f-ref').value.trim();
  const tipo = tipoSel.value;
  const tipoTexto = document.getElementById('f-tipo-texto').value.trim();
  if (!nome) {
    erro.textContent = 'Informe o nome do modelo.';
    return;
  }
  if (tipo === 'outro' && !tipoTexto) {
    erro.textContent = 'Escreva o que é no campo Outro.';
    return;
  }
  const ativo = ativoComRef(ref);
  if (!editingId && ativo) {
    erro.textContent = `A referência ${ref} já está em ${statusLabel(ativo.status)}.`;
    return;
  }
  try {
    const current = editingId ? items.find((i) => i.id === editingId) : null;
    const setor = setorSel.value || 'estilo';
    let ajusteN = Number(current?.ajuste_n) || 0;
    if (tipo === 'ajuste') {
      ajusteN = Math.max(1, ajusteN);
      if (!editingId) {
        const maxN = historicoDaRef(ref).reduce((n, i) => Math.max(n, Number(i.ajuste_n) || 0), 0);
        ajusteN = Math.max(1, maxN + 1);
      }
    }
    const payload = {
      nome,
      cliente: document.getElementById('f-cliente').value.trim(),
      obs: document.getElementById('f-obs').value.trim(),
      tipo,
      tipo_texto: tipo === 'outro' ? tipoTexto : '',
      ajuste_n: ajusteN,
      syntech_codigo: ref,
      referencia: ref,
    };
    if (!editingId) {
      payload.status = setor;
    } else if (current && normalizeStatus(current.status) !== setor) {
      payload.status = setor;
      payload.prioridade = nextPrioridade(setor);
      payload.historico = pushHist(current, 'moveu', current.status, setor);
    }
    await saveItem(payload);
    if (!editingId) {
      activeTab = setor;
      sessionStorage.setItem('desenv-aba', activeTab);
    } else if (payload.status) {
      activeTab = payload.status;
      sessionStorage.setItem('desenv-aba', activeTab);
    }
    closeDialog();
  } catch (err) {
    erro.textContent = err instanceof Error ? err.message : 'Não deu para salvar.';
  }
});

abasEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  sessionStorage.setItem('desenv-aba', activeTab);
  render();
});

listaEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-act]');
  const card = ev.target.closest('.card');
  if (!btn || !card) return;
  const item = items.find((row) => row.id === card.dataset.id);
  if (!item) return;
  if (btn.dataset.act === 'edit') openDialog(item);
  if (btn.dataset.act === 'up') void move(item.id, -1);
  if (btn.dataset.act === 'down') void move(item.id, 1);
  if (btn.dataset.act === 'ok') void avancar(item);
  if (btn.dataset.act === 'voltar-setor') void voltarSetor(item);
  if (btn.dataset.act === 'voltar') void voltouCliente(item);
  if (btn.dataset.act === 'encerrar') void encerrar(item);
});

boot();
