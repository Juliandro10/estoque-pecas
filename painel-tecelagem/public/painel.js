const maquinasEl = document.getElementById('maquinas');
const esperaEl = document.getElementById('espera');
const resumoEl = document.getElementById('resumo');
const avisoEl = document.getElementById('aviso');
const relogioEl = document.getElementById('relogio');

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[ch]));
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

function isHosted() {
  return /(?:^|\.)web\.app$|(?:^|\.)firebaseapp\.com$/.test(location.hostname)
    || location.pathname.includes('/tecelagem');
}

function tickClock() {
  relogioEl.textContent = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function render(board) {
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
      const stopCls = parada
        ? ` stop-${parada.familia === 'mecanica' ? 'mecanica' : 'processo'}${agora ? ' com-parada' : ''}`
        : '';
      const selo = parada ? `<div class="selo">${esc(parada.motivo)}</div>` : '';
      if (!agora) {
        const depois = sug
          ? `<div class="depois">Sugestão: ${sugPedido(sug, espera)} · prazo ${esc(formatDate(sug.prazo))} · entra ${esc(formatDate(sug.entra_em))}</div>`
          : `<div class="depois">Sem sugestão no momento</div>`;
        return `<article class="maq idle${stopCls}"><div class="num">${esc(m.numero)}</div><div>
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
      return `<article class="maq live${stopCls}"><div class="num">${esc(m.numero)}</div><div>
        ${selo}
        <div class="peca">${esc(agora.programa)}</div>
        <div class="destaque">Pedido ${esc(agora.pedido ?? '—')} — falta ${esc(ordensLabel(opsRestantes))}</div>
        <div class="destaque fim${fimCls ? ` ${fimCls}` : ''}">Término — ${esc(formatTermino(termino))}</div>
        <div class="detalhe">Ordem atual ${esc(padItem(agora.item_op))} — falta ${esc(pecasLabel(agora.restante))}</div>
        ${depois}
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

async function load() {
  try {
    render(isHosted() ? await loadFromCloud() : await loadFromLocal());
  } catch (err) {
    avisoEl.hidden = false;
    avisoEl.textContent = err instanceof Error ? err.message : 'Não deu para ler o quadro.';
  }
}

tickClock();
setInterval(tickClock, 1000);
load();
setInterval(load, isHosted() ? 30_000 : 60_000);
