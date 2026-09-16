const maquinasEl = document.getElementById('maquinas');
const esperaEl = document.getElementById('espera');
const resumoEl = document.getElementById('resumo');
const avisoEl = document.getElementById('aviso');
const relogioEl = document.getElementById('relogio');
const tituloEl = document.getElementById('titulo');
const viewTecelagem = document.getElementById('view-tecelagem');
const viewDesenv = document.getElementById('view-desenv');
const desenvAbasEl = document.getElementById('desenv-abas');
const desenvListaEl = document.getElementById('desenv-lista');

const CRACHA_PADRAO = '350';
let canWrite = false;
let motivos = [];
let lastBoard = null;
let dlgMaquina = null;
let dlgMotivo = null;
let dlgBusy = false;
let modo = 'tecelagem';
let desenvPublico = null;
let desenvTab = 'estilo';

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
}

function fichaCustoUrl(ref) {
  const url = new URL('../ficha-custo/', window.location.href);
  const value = String(ref ?? '').trim();
  if (value) url.searchParams.set('ref', value);
  return url.toString();
}

function openFichaCusto(ref) {
  window.open(fichaCustoUrl(ref), '_blank', 'noopener,noreferrer');
}

function fichaCustoBtn(ref) {
  const value = String(ref ?? '').trim();
  if (!value) return '';
  return `<button type="button" class="ficha-custo" data-ficha-custo="${esc(value)}">Ficha custos</button>`;
}

function padItem(n) {
  return String(n).padStart(6, '0');
}

function datePart(iso) {
  if (!iso) return '';
  return String(iso).slice(0, 10);
}

function formatDate(iso) {
  const day = datePart(iso);
  if (!day) return '—';
  const [y, m, d] = day.split('-');
  return `${d}/${m}`;
}

function formatTermino(iso) {
  if (!iso) return '—';
  const day = datePart(iso);
  const [y, m, d] = day.split('-');
  if (!y || !m || !d) return '—';
  const data = `${d}/${m}/${y}`;
  const time = String(iso).includes('T') ? String(iso).slice(11, 16) : '';
  return time ? `${data} ${time}` : data;
}

function todayYmd() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const get = (type) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function addDaysYmd(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;
}

function pecasLabel(n) {
  const q = Number(n);
  const qtd = Number.isFinite(q) ? q : 0;
  return `${qtd} ${qtd === 1 ? 'peça' : 'peças'}`;
}

function ordensLabel(n) {
  const q = Number(n);
  const qtd = Number.isFinite(q) ? Math.max(0, q) : 0;
  return `${qtd} ${qtd === 1 ? 'ordem' : 'ordens'}`;
}

function fimClass(iso) {
  const day = datePart(iso);
  if (!day) return '';
  const today = todayYmd();
  if (day < today) return 'late';
  if (day === today || day === addDaysYmd(today, 1)) return 'soon';
  return '';
}

function sugPedido(sug, espera) {
  const pedido = `pedido ${esc(sug.pedido ?? '—')}`;
  const daFila = (espera ?? []).find((p) => p.pedido === sug.pedido);
  const nome = sug.programa || sug.referencia || daFila?.referencia || daFila?.referencias?.[0];
  return nome ? `${pedido} · ${esc(nome)}` : pedido;
}

function paradaLabel(parada) {
  const obs = String(parada.obs ?? '').replace(/\s+/g, ' ').trim();
  return obs ? `${parada.motivo} · ${obs}` : parada.motivo;
}

function isHosted() {
  return /(?:^|\.)web\.app$|(?:^|\.)firebaseapp\.com$/.test(location.hostname);
}

function fold(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function crachaSalvo() {
  try {
    return localStorage.getItem('painel-cracha') || CRACHA_PADRAO;
  } catch {
    return CRACHA_PADRAO;
  }
}

function salvarCracha(value) {
  try {
    localStorage.setItem('painel-cracha', value);
  } catch {
    /* ignore */
  }
}

function ensureDialog() {
  if (document.getElementById('dlg')) return;
  const wrap = document.createElement('div');
  wrap.id = 'dlg';
  wrap.className = 'dlg';
  wrap.hidden = true;
  wrap.innerHTML = `
    <div class="dlg-card">
      <h3 id="dlg-title">Máquina</h3>
      <p class="dlg-status" id="dlg-status"></p>
      <div id="dlg-abrir">
        <label for="dlg-busca">Motivo (código ou texto)</label>
        <input id="dlg-busca" autocomplete="off" placeholder="Ex.: 10 ou desenv" />
        <div class="dlg-lista" id="dlg-lista"></div>
        <label for="dlg-obs">Observação</label>
        <textarea id="dlg-obs" maxlength="600"></textarea>
      </div>
      <label for="dlg-cracha">Crachá</label>
      <input id="dlg-cracha" inputmode="numeric" />
      <p class="dlg-erro" id="dlg-erro"></p>
      <div class="dlg-acoes">
        <button type="button" class="dlg-go" id="dlg-confirma">Confirma</button>
        <button type="button" class="dlg-stop" id="dlg-encerrar" hidden>Encerrar parada</button>
        <button type="button" class="dlg-cancel" id="dlg-cancela">Cancelar</button>
      </div>
    </div>`;
  document.body.appendChild(wrap);
  document.getElementById('dlg-busca').addEventListener('input', () => renderMotivos());
  document.getElementById('dlg-confirma').addEventListener('click', () => void confirmarAbertura());
  document.getElementById('dlg-encerrar').addEventListener('click', () => void encerrarParada());
  document.getElementById('dlg-cancela').addEventListener('click', fecharDialog);
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap) fecharDialog();
  });
}

function fecharDialog() {
  const dlg = document.getElementById('dlg');
  if (dlg) dlg.hidden = true;
  dlgMaquina = null;
  dlgMotivo = null;
}

function familiaLabel(familia) {
  return familia === 'mecanica' ? 'mecânica' : 'outras';
}

function filtrarMotivos(query) {
  const q = fold(query);
  if (!q) return motivos;
  if (/^\d+$/.test(query.trim())) {
    const codigo = Number(query.trim());
    return motivos.filter((m) => Number(m.codigo) === codigo);
  }
  return motivos.filter((m) => fold(m.nome).includes(q));
}

function renderMotivos() {
  const lista = document.getElementById('dlg-lista');
  const busca = document.getElementById('dlg-busca');
  if (!lista || !busca) return;
  const rows = filtrarMotivos(busca.value);
  if (dlgMotivo && !rows.some((m) => m.tipo === dlgMotivo.tipo && m.codigo === dlgMotivo.codigo)) {
    dlgMotivo = rows.length === 1 ? rows[0] : null;
  }
  if (!dlgMotivo && rows.length === 1) dlgMotivo = rows[0];
  lista.innerHTML = rows
    .map((m) => {
      const sel = dlgMotivo && m.tipo === dlgMotivo.tipo && m.codigo === dlgMotivo.codigo ? ' sel' : '';
      return `<button type="button" class="dlg-opt${sel}" data-tipo="${esc(m.tipo)}" data-codigo="${esc(m.codigo)}">
        ${esc(m.codigo)} · ${esc(m.nome)}
        <small>${esc(familiaLabel(m.familia))}</small>
      </button>`;
    })
    .join('') || '<p class="dlg-status">Nenhum motivo com esse código ou texto.</p>';
  lista.querySelectorAll('.dlg-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      dlgMotivo = motivos.find(
        (m) => m.tipo === Number(btn.dataset.tipo) && m.codigo === Number(btn.dataset.codigo)
      ) ?? null;
      renderMotivos();
    });
  });
}

function abrirDialog(machine) {
  ensureDialog();
  dlgMaquina = machine;
  dlgMotivo = null;
  dlgBusy = false;
  const dlg = document.getElementById('dlg');
  const abrir = document.getElementById('dlg-abrir');
  const confirma = document.getElementById('dlg-confirma');
  const encerrar = document.getElementById('dlg-encerrar');
  document.getElementById('dlg-title').textContent = `Máquina ${machine.numero}`;
  document.getElementById('dlg-status').textContent = machine.parada
    ? `Parada aberta: ${paradaLabel(machine.parada)}`
    : 'Abrir parada no Syntech (F5).';
  document.getElementById('dlg-busca').value = '';
  document.getElementById('dlg-obs').value = '';
  document.getElementById('dlg-cracha').value = crachaSalvo();
  document.getElementById('dlg-erro').textContent = '';
  abrir.hidden = Boolean(machine.parada);
  confirma.hidden = Boolean(machine.parada);
  encerrar.hidden = !machine.parada;
  renderMotivos();
  dlg.hidden = false;
  (machine.parada ? document.getElementById('dlg-cracha') : document.getElementById('dlg-busca')).focus();
}

async function postParada(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Não deu para gravar no Syntech.');
  return data;
}

async function confirmarAbertura() {
  if (dlgBusy || !dlgMaquina) return;
  const erro = document.getElementById('dlg-erro');
  if (!dlgMotivo) {
    erro.textContent = 'Escolha o motivo (código ou texto).';
    return;
  }
  const cracha = document.getElementById('dlg-cracha').value.trim();
  if (!cracha) {
    erro.textContent = 'Informe o crachá.';
    return;
  }
  dlgBusy = true;
  erro.textContent = 'Gravando…';
  try {
    salvarCracha(cracha);
    await postParada('/api/paradas/abrir', {
      maquina: dlgMaquina.numero,
      tipo: dlgMotivo.tipo,
      codigo: dlgMotivo.codigo,
      cracha,
      obs: document.getElementById('dlg-obs').value,
    });
    fecharDialog();
    await load();
  } catch (err) {
    erro.textContent = err instanceof Error ? err.message : 'Falha ao abrir a parada.';
  } finally {
    dlgBusy = false;
  }
}

async function encerrarParada() {
  if (dlgBusy || !dlgMaquina) return;
  const erro = document.getElementById('dlg-erro');
  const cracha = document.getElementById('dlg-cracha').value.trim();
  if (!cracha) {
    erro.textContent = 'Informe o crachá.';
    return;
  }
  dlgBusy = true;
  erro.textContent = 'Encerrando…';
  try {
    salvarCracha(cracha);
    await postParada('/api/paradas/encerrar', { maquina: dlgMaquina.numero, cracha });
    fecharDialog();
    await load();
  } catch (err) {
    erro.textContent = err instanceof Error ? err.message : 'Falha ao encerrar a parada.';
  } finally {
    dlgBusy = false;
  }
}

function tickClock() {
  relogioEl.textContent = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function render(board) {
  lastBoard = board;
  const physical = (board.machines ?? []).filter((m) => !m.grupo);
  const espera = board.espera
    ?? (board.pedidos ?? []).filter((p) => (p.maquinas?.length ?? 0) === 0 && p.restante > 0);
  const paradas = physical.filter((m) => m.parada);
  const live = physical.filter((m) => m.agora && !m.parada).length;
  const atualizado = board.updated_at
    ? new Date(board.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  const extraParada = paradas.length
    ? ` · ${paradas.length} ${paradas.length === 1 ? 'parada apontada' : 'paradas apontadas'}`
    : '';
  resumoEl.textContent = `${live} tecendo agora${extraParada} · ${espera.length} em espera · atualizado ${atualizado}`;

  const ageMs = board.updated_at ? Date.now() - Date.parse(board.updated_at) : 0;
  if (Number.isFinite(ageMs) && ageMs > 15 * 60 * 1000) {
    avisoEl.hidden = false;
    avisoEl.textContent = 'Quadro parado. Ligue o Painel Tecelagem no PC da fábrica.';
  } else {
    avisoEl.hidden = true;
  }

  maquinasEl.innerHTML = physical
    .map((m) => {
      const agora = m.agora;
      const sug = m.sugestao;
      const parada = m.parada;
      const writeCls = canWrite ? ' clickable' : '';
      const stopCls = parada
        ? ` stop-${parada.familia === 'mecanica' ? 'mecanica' : 'processo'}${agora ? ' com-parada' : ''}`
        : '';
      const selo = parada ? `<div class="selo">${esc(paradaLabel(parada))}</div>` : '';
      if (!agora) {
        const depois = sug
          ? `<div class="depois">Sugestão: ${sugPedido(sug, espera)} · prazo ${esc(formatDate(sug.prazo))} · entra ${esc(formatDate(sug.entra_em))}</div>`
          : `<div class="depois">Sem sugestão no momento</div>`;
        return `<article class="maq idle${stopCls}${writeCls}" data-maq="${esc(m.numero)}"><div class="num">${esc(m.numero)}</div><div>
          ${selo}
          <div class="peca">${parada ? 'Ordem aberta · máquina parada' : 'Parada'}</div>
          ${depois}
        </div></article>`;
      }
      const depois = sug
        ? `<div class="depois">Depois: ${sugPedido(sug, espera)}</div>`
        : '';
      const opsRestantes = Number.isFinite(Number(agora.ops_no_pedido))
        ? Number(agora.ops_no_pedido)
        : 1 + Number(agora.fila_ordens ?? 0);
      const termino = agora.livre_em || sug?.entra_em || agora.previsao_pedido;
      const fimCls = fimClass(termino);
      return `<article class="maq live${stopCls}${writeCls}" data-maq="${esc(m.numero)}"><div class="num">${esc(m.numero)}</div><div>
        ${selo}
        <div class="peca">${esc(agora.programa)}</div>
        <div class="destaque">Pedido ${esc(agora.pedido ?? '—')} — falta ${esc(ordensLabel(opsRestantes))}</div>
        <div class="destaque fim${fimCls ? ` ${fimCls}` : ''}">Término — ${esc(formatTermino(termino))}</div>
        <div class="detalhe">Ordem atual ${esc(padItem(agora.item_op))} — falta ${esc(pecasLabel(agora.restante))}</div>
        ${depois}
        ${fichaCustoBtn(agora.programa)}
      </div></article>`;
    })
    .join('');

  esperaEl.innerHTML = espera
    .map((p) => {
      const cls = p.atrasado ? 'fila late' : 'fila';
      const referencia = p.referencia ?? p.referencias?.[0] ?? '—';
      return `<article class="${cls}">
        <strong>${esc(p.pedido ?? '—')} · ${esc(referencia)}</strong>
        Prazo ${esc(formatDate(p.prazo))} · ${esc(p.restante)} pç
        · sugestão máq. ${esc(p.sugestao_maquina ?? '—')} · entra ${esc(formatDate(p.sugestao_entra_em))}
        ${fichaCustoBtn(referencia === '—' ? '' : referencia)}
      </article>`;
    })
    .join('');
}

async function loadFromCloud() {
  const cfg = window.PAINEL_FIREBASE;
  if (!cfg?.projectId || !cfg?.apiKey) {
    throw new Error('Falta a configuração da nuvem neste endereço.');
  }
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/tecelagem_publico/quadro`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error('Ainda não chegou quadro da fábrica. Deixe o Painel Tecelagem ligado no PC da tecelagem.');
  }
  if (!res.ok) throw new Error('Não deu para ler o quadro no celular.');
  const doc = await res.json();
  const json = doc.fields?.json?.stringValue;
  if (!json) throw new Error('Quadro vazio na nuvem.');
  return JSON.parse(json);
}

async function loadDesenvCloud() {
  const cfg = window.PAINEL_FIREBASE;
  if (!cfg?.projectId || !cfg?.apiKey) {
    throw new Error('Falta a configuração da nuvem neste endereço.');
  }
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/desenv_publico/fila`;
  const res = await fetch(url);
  if (res.status === 404) {
    throw new Error('Ainda não chegou a fila de desenvolvimentos. Deixe o Painel Tecelagem ligado.');
  }
  if (!res.ok) throw new Error('Não deu para ler o desenvolvimento.');
  const doc = await res.json();
  const json = doc.fields?.json?.stringValue;
  if (!json) throw new Error('Fila de desenvolvimentos vazia na nuvem.');
  return JSON.parse(json);
}

function tipoPublico(item) {
  if (item.tipo === 'ajuste') return 'Ajuste';
  if (item.tipo === 'peca_foto') return 'Peça foto';
  if (item.tipo === 'show_room') return 'Show room';
  if (item.tipo === 'outro') return item.tipo_texto || 'Outro';
  return 'Modelo novo';
}

function renderDesenv() {
  const data = desenvPublico;
  const setores = Array.isArray(data?.setores) ? data.setores : [];
  if (!setores.some((s) => s.id === desenvTab)) desenvTab = setores[0]?.id || 'estilo';
  const atual = setores.find((s) => s.id === desenvTab) ?? { itens: [], label: '', n: 0 };
  desenvAbasEl.innerHTML = setores
    .map(
      (s) =>
        `<button type="button" class="aba${s.id === desenvTab ? ' on' : ''}" data-tab="${esc(s.id)}">${esc(s.label)}<span class="n">${esc(s.n ?? 0)}</span></button>`
    )
    .join('');
  const itens = Array.isArray(atual.itens) ? atual.itens : [];
  resumoEl.textContent = itens.length
    ? `${itens.length} em ${atual.label} · só acompanhamento`
    : `Nada em ${atual.label || 'Desenvolvimento'}`;
  if (!itens.length) {
    desenvListaEl.innerHTML = '<p class="nota">Nenhum modelo neste setor.</p>';
    return;
  }
  desenvListaEl.innerHTML = itens
    .map((item) => {
      const ref = item.ref ? `<span class="ref-tag">${esc(item.ref)}</span>` : '';
      const cliente = item.cliente ? esc(item.cliente) : 'sem cliente';
      return `<article class="desenv-card${item.trabalhando ? ' trabalho' : ''}">
        <div class="nome">${ref}${esc(item.nome)}</div>
        <div class="meta">${cliente} · ${esc(tipoPublico(item))}${item.trabalhando ? ' · em trabalho' : ''}</div>
        ${fichaCustoBtn(item.ref)}
      </article>`;
    })
    .join('');
}

function setModo(next) {
  modo = next;
  document.querySelectorAll('.modo').forEach((btn) => {
    btn.classList.toggle('on', btn.dataset.modo === modo);
  });
  viewTecelagem.hidden = modo !== 'tecelagem';
  viewDesenv.hidden = modo !== 'desenv';
  tituloEl.textContent = modo === 'desenv' ? 'Desenvolvimento' : 'Tecelagem';
  void load();
}

async function loadFromLocal() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch('/api/quadro', { signal: ctrl.signal });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao ler o quadro');
    return data;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('O Syntech nao respondeu a tempo. Veja o log no reloginho do Painel Tecelagem.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function detectWrite() {
  if (isHosted()) {
    canWrite = false;
    return;
  }
  try {
    const res = await fetch('/api/paradas/motivos');
    if (!res.ok) {
      canWrite = false;
      return;
    }
    const data = await res.json();
    motivos = Array.isArray(data.motivos) ? data.motivos : [];
    canWrite = motivos.length > 0;
    if (canWrite) ensureDialog();
  } catch {
    canWrite = false;
  }
}

async function load() {
  try {
    if (modo === 'desenv') {
      desenvPublico = await loadDesenvCloud();
      avisoEl.hidden = true;
      renderDesenv();
      return;
    }
    render(isHosted() ? await loadFromCloud() : await loadFromLocal());
  } catch (err) {
    avisoEl.hidden = false;
    avisoEl.textContent = err instanceof Error ? err.message : 'Não deu para ler o quadro.';
  }
}

function onFichaCustoClick(ev) {
  const btn = ev.target.closest('[data-ficha-custo]');
  if (!btn) return false;
  ev.preventDefault();
  ev.stopPropagation();
  openFichaCusto(btn.getAttribute('data-ficha-custo'));
  return true;
}

maquinasEl.addEventListener('click', (ev) => {
  if (onFichaCustoClick(ev)) return;
  if (!canWrite) return;
  const card = ev.target.closest('.maq[data-maq]');
  if (!card || !lastBoard) return;
  const numero = Number(card.dataset.maq);
  const machine = (lastBoard.machines ?? []).find((m) => m.numero === numero);
  if (!machine || machine.grupo) return;
  abrirDialog(machine);
});

document.querySelectorAll('.modo').forEach((btn) => {
  btn.addEventListener('click', () => setModo(btn.dataset.modo));
});
document.getElementById('btn-ficha-custo').addEventListener('click', (ev) => {
  ev.preventDefault();
  ev.stopPropagation();
  openFichaCusto('');
});
esperaEl.addEventListener('click', onFichaCustoClick);
desenvListaEl.addEventListener('click', onFichaCustoClick);
desenvAbasEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  desenvTab = btn.dataset.tab;
  renderDesenv();
});

tickClock();
setInterval(tickClock, 1000);
void detectWrite().then(load);
setInterval(load, isHosted() ? 30_000 : 60_000);
