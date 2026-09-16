function esc(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function candidates(raw) {
  const text = String(raw ?? '').trim();
  const out = [];
  const add = (value) => {
    const item = String(value ?? '').trim();
    if (item && !out.includes(item)) out.push(item);
  };
  add(text);
  const numeric = text.match(/^(\d{3,6})\b/);
  if (numeric) add(numeric[1]);
  add(text.split(/[-_\s./]/)[0]);
  return out;
}

function sheetHtml(view) {
  const yarns = Array.isArray(view.yarns) && view.yarns.length
    ? `<h2>Fios consolidados (programa)</h2>
      <table>
        <thead><tr><th>%</th><th>Consumo total</th><th>Bico</th><th>Fio</th><th>Descrição</th><th>Partes</th></tr></thead>
        <tbody>${view.yarns
          .map(
            (row) => `<tr>
              <td class="num">${esc(row.pct)}</td>
              <td class="num">${esc(row.consumption)}</td>
              <td>${esc(row.bico)}</td>
              <td>${esc(row.letter)}</td>
              <td>${esc(row.description)}</td>
              <td>${esc(row.parts)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>`
    : '';
  const summary = Array.isArray(view.summary) && view.summary.length
    ? `<h2>Resumo para preço — peso por fio e cor</h2>
      <table>
        <thead><tr><th>Fio</th><th>Cor</th><th>Peso (kg)</th><th>%</th></tr></thead>
        <tbody>${view.summary
          .map(
            (row) => `<tr>
              <td>${esc(row.tipo)}</td>
              <td>${esc(row.cor)}</td>
              <td class="num">${esc(row.peso)}</td>
              <td class="num">${esc(row.pct)}</td>
            </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${esc(view.summary_total_peso)}</td><td class="num">${esc(view.summary_total_pct)}</td></tr></tfoot>
      </table>`
    : '';
  const machine = view.machine_line ? `<p class="meta">${esc(view.machine_line)}</p>` : '';
  const obs = view.observations ? `<p class="obs">Obs: ${esc(view.observations)}</p>` : '';
  return `<article class="sheet">
    <h1>Ficha de Cadastro — Dados de Custo</h1>
    <p class="company">${esc(view.company || 'TRICOT & CIA')}</p>
    <p class="meta">Ref: ${esc(view.reference)} — ${esc(view.name)}</p>
    ${machine}
    <p class="meta">Atualizado: ${esc(view.updated_label)}</p>
    <table>
      <thead><tr><th>Parte</th><th>Arquivo</th><th>Tempo</th><th>Peso bruto (kg)</th></tr></thead>
      <tbody>${(view.parts ?? [])
        .map(
          (part) => `<tr>
            <td>${esc(part.label)}</td>
            <td>${esc(part.file_name)}</td>
            <td class="num">${esc(part.time)}</td>
            <td class="num">${esc(part.weight)}</td>
          </tr>`
        )
        .join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${esc(view.parts_total_time)}</td><td class="num">${esc(view.parts_total_weight)}</td></tr></tfoot>
    </table>
    ${yarns}
    ${summary}
    ${obs}
  </article>`;
}

async function fetchJsonDoc(collection, id) {
  const cfg = window.FICHA_CUSTO_FIREBASE;
  if (!cfg?.projectId || !cfg?.apiKey) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('Não deu para ler a ficha de custos.');
  const doc = await res.json();
  const json = doc.fields?.json?.stringValue;
  if (!json) return null;
  return JSON.parse(json);
}

async function fetchPdfLocal(ref) {
  for (const id of candidates(ref)) {
    try {
      const res = await fetch(`/api/programs/cadastro-pdf?ref=${encodeURIComponent(id)}`);
      if (!res.ok) continue;
      const type = res.headers.get('content-type') || '';
      if (!type.includes('pdf')) continue;
      const blob = await res.blob();
      if (blob.size < 80) continue;
      return URL.createObjectURL(blob);
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchPdfCloud(ref) {
  for (const id of candidates(ref)) {
    const data = await fetchJsonDoc('cadastro_custo_pdf', id);
    if (data?.pdf_base64) return `data:application/pdf;base64,${data.pdf_base64}`;
  }
  return null;
}

async function fetchView(ref) {
  for (const id of candidates(ref)) {
    const view = await fetchJsonDoc('cadastro_custo_publico', id);
    if (view && typeof view === 'object' && !view.pdf_base64) return view;
  }
  return null;
}

const refEl = document.getElementById('ref');
const erroEl = document.getElementById('erro');
const folhaEl = document.getElementById('folha');
let pdfUrl = '';

function showErro(text) {
  erroEl.hidden = !text;
  erroEl.textContent = text || '';
}

function showPdf(url, ref) {
  document.title = `Ficha de custos ${ref}`;
  folhaEl.innerHTML = `<iframe class="sheet-pdf" title="Ficha de custos ${esc(ref)}" src="${esc(url)}"></iframe>
    <p class="meta" style="max-width:210mm;margin:10px auto 0"><a href="${esc(url)}" target="_blank" rel="noreferrer">Abrir PDF em nova aba</a></p>`;
}

async function abrir(raw) {
  const ref = String(raw ?? refEl.value ?? '').trim();
  refEl.value = ref;
  if (!ref) {
    showErro('Informe a referência.');
    folhaEl.innerHTML = '';
    return;
  }
  const next = new URL(window.location.href);
  next.searchParams.set('ref', ref);
  window.history.replaceState({}, '', next);
  showErro('');
  folhaEl.innerHTML = '<p class="meta">Carregando…</p>';
  if (pdfUrl && pdfUrl.startsWith('blob:')) URL.revokeObjectURL(pdfUrl);
  pdfUrl = '';
  try {
    const localPdf = await fetchPdfLocal(ref);
    if (localPdf) {
      pdfUrl = localPdf;
      showPdf(localPdf, ref);
      return;
    }
    const cloudPdf = await fetchPdfCloud(ref);
    if (cloudPdf) {
      showPdf(cloudPdf, ref);
      return;
    }
    const view = await fetchView(ref);
    if (view) {
      document.title = `Ficha de custos ${view.reference}`;
      folhaEl.innerHTML = sheetHtml(view);
      return;
    }
    throw new Error(
      'Não achei a ficha nesta referência. Se o PDF já está na pasta do programa, abra com o Iniciar.bat ligado para copiar.'
    );
  } catch (err) {
    folhaEl.innerHTML = '';
    showErro(err instanceof Error ? err.message : 'Não deu para abrir a ficha.');
  }
}

document.getElementById('abrir').addEventListener('click', () => void abrir());
document.getElementById('imprimir').addEventListener('click', () => window.print());
refEl.addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') {
    ev.preventDefault();
    void abrir();
  }
});

const initial = new URLSearchParams(window.location.search).get('ref') ?? '';
if (initial.trim()) {
  refEl.value = initial.trim();
  void abrir(initial.trim());
}
