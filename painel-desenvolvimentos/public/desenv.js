const STATUS = [
  { id: 'ficha', label: 'Esperando ficha' },
  { id: 'modelagem', label: 'Modelagem · esperando molde' },
  { id: 'programacao', label: 'Programação' },
  { id: 'costura', label: 'Costura e acabamento' },
  { id: 'cliente', label: 'Enviado ao cliente' },
];

const COL = 'desenvolvimentos';
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const listaEl = document.getElementById('lista');
const avisoEl = document.getElementById('aviso');
const resumoEl = document.getElementById('resumo');
const dlg = document.getElementById('dlg');
const form = document.getElementById('dlg-form');
const statusSel = document.getElementById('f-status');
const dlgSyn = document.getElementById('dlg-syntech');
const synLista = document.getElementById('syn-lista');
const synBusca = document.getElementById('syn-busca');
const synErro = document.getElementById('syn-erro');
const btnSyntech = document.getElementById('btn-syntech');

let syntechOk = false;
let syntechItens = [];
let syntechBusy = false;
let syntechTimer = 0;

let db = null;
let auth = null;
let editingId = null;
let items = [];
let unsub = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function statusLabel(id) {
  return STATUS.find((s) => s.id === id)?.label ?? id;
}

function showAviso(text) {
  avisoEl.hidden = !text;
  avisoEl.textContent = text || '';
}

function fillStatus(selected) {
  statusSel.innerHTML = STATUS.map(
    (s) => `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.label)}</option>`
  ).join('');
}

function openDialog(item) {
  editingId = item?.id ?? null;
  document.getElementById('dlg-title').textContent = editingId ? 'Editar desenvolvimento' : 'Novo desenvolvimento';
  document.getElementById('f-nome').value = item?.nome ?? '';
  document.getElementById('f-cliente').value = item?.cliente ?? '';
  document.getElementById('f-obs').value = item?.obs ?? '';
  document.getElementById('dlg-erro').textContent = '';
  fillStatus(item?.status ?? 'ficha');
  dlg.hidden = false;
  document.getElementById('f-nome').focus();
}

function closeDialog() {
  dlg.hidden = true;
  editingId = null;
}

function render() {
  const ordered = [...items].sort((a, b) => a.prioridade - b.prioridade);
  resumoEl.textContent = ordered.length
    ? `${ordered.length} na fila · quem está no topo entra primeiro`
    : 'Nenhum desenvolvimento na fila';
  if (!ordered.length) {
    listaEl.innerHTML = '<p class="empty">Clique em Novo desenvolvimento para lançar o primeiro.</p>';
    return;
  }
  listaEl.innerHTML = ordered
    .map((item, index) => {
      const cliente = item.cliente ? esc(item.cliente) : 'sem cliente';
      const obs = item.obs ? `<div class="meta">${esc(item.obs)}</div>` : '';
      return `<article class="card" data-id="${esc(item.id)}">
        <div class="prio">${index + 1}</div>
        <div>
          <div class="nome">${item.syntech_codigo ? `<span class="ref-tag">${esc(item.syntech_codigo)}</span>` : ''}${esc(item.nome)}</div>
          <div class="meta">${cliente}</div>
          <div class="selo ${esc(item.status)}">${esc(statusLabel(item.status))}</div>
          ${obs}
        </div>
        <div class="acoes">
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
  const email = auth.currentUser?.email ?? '';
  if (editingId) {
    await db.collection(COL).doc(editingId).update({
      ...payload,
      atualizado_em: now,
    });
    return;
  }
  const max = items.reduce((n, item) => Math.max(n, Number(item.prioridade) || 0), 0);
  await db.collection(COL).add({
    ...payload,
    prioridade: max + 1,
    criado_em: now,
    atualizado_em: now,
    criado_por: email,
  });
}

async function move(id, dir) {
  const ordered = [...items].sort((a, b) => a.prioridade - b.prioridade);
  const index = ordered.findIndex((item) => item.id === id);
  if (index < 0) return;
  const swap = ordered[index + dir];
  if (!swap) return;
  const a = ordered[index];
  const batch = db.batch();
  batch.update(db.collection(COL).doc(a.id), { prioridade: swap.prioridade, atualizado_em: new Date().toISOString() });
  batch.update(db.collection(COL).doc(swap.id), { prioridade: a.prioridade, atualizado_em: new Date().toISOString() });
  await batch.commit();
}

function listen() {
  if (unsub) unsub();
  unsub = db.collection(COL).onSnapshot(
    (snap) => {
      items = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      if (!dlgSyn.hidden) renderSyntech();
      showAviso('');
    },
    (err) => {
      showAviso(err.message || 'Não deu para ler a fila na nuvem.');
    }
  );
}

function jaNaFila(codigo) {
  return items.some((item) => String(item.syntech_codigo ?? '') === String(codigo));
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
    syntechOk = res.ok;
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
    await saveItem({
      nome: row.nome,
      cliente: '',
      status: 'programacao',
      obs: row.grupo ? `Syntech ${row.codigo} · ${row.grupo}` : `Syntech ${row.codigo}`,
      syntech_codigo: row.codigo,
    });
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

function showApp(user) {
  loginEl.hidden = true;
  appEl.hidden = false;
  document.getElementById('user-email').textContent = user.email ?? '';
  document.getElementById('btn-sair').hidden = inIframe();
  listen();
  void probeSyntech();
}

function showLogin() {
  if (unsub) unsub();
  unsub = null;
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
  fillStatus('ficha');
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
      document.getElementById('login-email').value.trim(),
      document.getElementById('login-pass').value
    );
  } catch {
    erro.textContent = 'E-mail ou senha incorretos.';
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

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const erro = document.getElementById('dlg-erro');
  erro.textContent = '';
  const nome = document.getElementById('f-nome').value.trim();
  if (!nome) {
    erro.textContent = 'Informe o nome do modelo.';
    return;
  }
  try {
    await saveItem({
      nome,
      cliente: document.getElementById('f-cliente').value.trim(),
      status: document.getElementById('f-status').value,
      obs: document.getElementById('f-obs').value.trim(),
    });
    closeDialog();
  } catch (err) {
    erro.textContent = err instanceof Error ? err.message : 'Não deu para salvar.';
  }
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
});

boot();
