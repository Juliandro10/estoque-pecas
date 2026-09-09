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

function tickClock() {
  relogioEl.textContent = new Date().toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function render(board) {
  avisoEl.hidden = true;
  const physical = (board.machines ?? []).filter((m) => !m.grupo);
  const live = physical.filter((m) => m.agora).length;
  const espera = (board.pedidos ?? []).filter((p) => (p.maquinas?.length ?? 0) === 0 && p.restante > 0);
  const atualizado = board.updated_at
    ? new Date(board.updated_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    : '—';
  resumoEl.textContent = `${live} tecendo agora · ${espera.length} em espera · atualizado ${atualizado}`;

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
      return `<article class="${cls}">
        <strong>${esc(p.pedido ?? '—')} · ${esc(p.referencias[0] ?? '—')}</strong>
        Prazo ${esc(formatDate(p.prazo))} · ${esc(p.restante)} pç
        · sugestão máq. ${esc(p.sugestao_maquina ?? '—')} · entra ${esc(formatDate(p.sugestao_entra_em))}
      </article>`;
    })
    .join('');
}

async function load() {
  try {
    const res = await fetch('/api/quadro');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Falha ao ler o quadro');
    render(data);
  } catch (err) {
    avisoEl.hidden = false;
    avisoEl.textContent = err instanceof Error ? err.message : 'Não deu para ler o Syntech.';
  }
}

tickClock();
setInterval(tickClock, 1000);
load();
setInterval(load, 60_000);
