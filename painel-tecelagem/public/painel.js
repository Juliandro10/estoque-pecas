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

function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}`;
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
  const live = physical.filter((m) => m.agora).length;
  const atualizado = board.updated_at
    ? new Date(board.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  resumoEl.textContent = `${live} tecendo agora · ${espera.length} em espera · atualizado ${atualizado}`;

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
      if (!agora) {
        const depois = sug
          ? `<div class="depois">Sugestão: pedido ${esc(sug.pedido ?? '—')} · prazo ${esc(formatDate(sug.prazo))} · entra ${esc(formatDate(sug.entra_em))}</div>`
          : `<div class="depois">Sem sugestão no momento</div>`;
        return `<article class="maq idle"><div class="num">${esc(m.numero)}</div><div>
          <div class="peca">Parada</div>
          ${depois}
        </div></article>`;
      }
      const fila =
        agora.fila_ordens > 0 ? ` · ${esc(agora.fila_ordens)} na fila` : '';
      const depois = sug
        ? `<div class="depois">Depois (sugestão): pedido ${esc(sug.pedido ?? '—')} · prazo ${esc(formatDate(sug.prazo))} · entra ${esc(formatDate(sug.entra_em))}</div>`
        : '';
      return `<article class="maq live"><div class="num">${esc(m.numero)}</div><div>
        <div class="peca">${esc(agora.programa)}</div>
        <div class="meta">Pedido ${esc(agora.pedido ?? '—')} · ordem ${esc(padItem(agora.item_op))} · faltam ${esc(agora.restante)}${fila} · acaba ${esc(formatDate(agora.previsao_pedido))}</div>
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
  const res = await fetch('/api/quadro');
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Falha ao ler o quadro');
  return data;
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
