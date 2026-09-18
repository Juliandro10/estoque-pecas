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

const OK_LABEL = 'OK, enviar próx. setor';

const TIPOS = [
  { id: 'novo', label: 'Modelo novo' },
  { id: 'ajuste', label: 'Ajuste' },
  { id: 'peca_foto', label: 'Peça foto' },
  { id: 'show_room', label: 'Show room' },
  { id: 'outro', label: 'Outro' },
];

const FICHA_FIELDS = [
  ['fi-colecao', 'colecao'],
  ['fi-cliente', 'cliente'],
  ['fi-ref', 'ref'],
  ['fi-familia', 'familia'],
  ['fi-nome', 'nome'],
  ['fi-prioridade', 'prioridade'],
  ['fi-estilista', 'estilista'],
  ['fi-data', 'data'],
  ['fi-passadoria', 'passadoria'],
  ['fi-maquina', 'maquina'],
  ['fi-fio1', 'fio1'],
  ['fi-fio2', 'fio2'],
  ['fi-fio3', 'fio3'],
  ['fi-cartela', 'cartela'],
  ['fi-regulagem', 'regulagem'],
  ['fi-n-cabos', 'n_cabos'],
  ['fi-barra', 'barra'],
  ['fi-punho', 'punho'],
  ['fi-frente', 'frente'],
  ['fi-costas', 'costas'],
  ['fi-manga', 'manga'],
  ['fi-acabamento', 'acabamento'],
  ['fi-decote', 'decote'],
  ['fi-etiqueta', 'etiqueta'],
  ['fi-comprimento', 'comprimento'],
  ['fi-largura', 'largura'],
  ['fi-aviamento', 'aviamento'],
  ['fi-notas', 'notas'],
  ['fi-ref-modelo', 'ref_modelo'],
  ['fi-ref-ponto', 'ref_ponto'],
  ['fi-comentarios', 'comentarios'],
  ['fi-p1-data', 'p1_data'],
  ['fi-p1-lacre', 'p1_lacre'],
  ['fi-p1-status', 'p1_status'],
  ['fi-p2-data', 'p2_data'],
  ['fi-p2-lacre', 'p2_lacre'],
  ['fi-p2-status', 'p2_status'],
  ['fi-p3-data', 'p3_data'],
  ['fi-p3-lacre', 'p3_lacre'],
  ['fi-p3-status', 'p3_status'],
];

const COL = 'desenvolvimentos';
const loginEl = document.getElementById('login');
const appEl = document.getElementById('app');
const abasEl = document.getElementById('abas');
const listaEl = document.getElementById('lista');
const agoraEl = document.getElementById('agora');
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
const btnCadSyntech = document.getElementById('btn-cad-syntech');
const btnVerSyncad = document.getElementById('btn-ver-syncad');
const dlgSyncad = document.getElementById('dlg-syncad');
const dlgCad = document.getElementById('dlg-cad-syntech');
const cadForm = document.getElementById('cad-form');
const cadErro = document.getElementById('cad-erro');
const dlgFicha = document.getElementById('dlg-ficha');
const fichaErroEl = document.getElementById('ficha-erro');
const FICHA_FOTOS = {
  foto: {
    key: 'foto',
    maxPx: 800,
    maxChars: 180000,
    preview: 'ficha-foto-preview',
    vazio: 'ficha-foto-vazio',
    limpar: 'ficha-foto-limpar',
    file: 'ficha-foto-file',
    cam: 'ficha-foto-cam',
  },
  modelo: {
    key: 'foto_modelo',
    maxPx: 640,
    maxChars: 130000,
    preview: 'ficha-foto-modelo-preview',
    vazio: 'ficha-foto-modelo-vazio',
    limpar: 'ficha-foto-modelo-limpar',
    file: 'ficha-foto-modelo-file',
    cam: 'ficha-foto-modelo-cam',
  },
  ponto: {
    key: 'foto_ponto',
    maxPx: 640,
    maxChars: 130000,
    preview: 'ficha-foto-ponto-preview',
    vazio: 'ficha-foto-ponto-vazio',
    limpar: 'ficha-foto-ponto-limpar',
    file: 'ficha-foto-ponto-file',
    cam: 'ficha-foto-ponto-cam',
  },
};
let fichaId = null;
let fichaFotos = { foto: '', foto_modelo: '', foto_ponto: '' };

let syntechOk = false;
let syntechLocal = false;
let syntechItens = [];
let syntechBusy = false;
let syntechTimer = 0;
let syntechCatalog = {};
let cadOpcoes = null;
let cadBusy = false;
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

function fichaCustoUrl(ref) {
  const url = new URL('../ficha-custo/', window.location.href);
  const value = String(ref ?? '').trim();
  if (value) url.searchParams.set('ref', value);
  return url.toString();
}

function openFichaCusto(ref) {
  window.open(fichaCustoUrl(ref), '_blank', 'noopener,noreferrer');
}

function sameRef(item, codigo) {
  const left = refOf(item);
  const right = String(codigo ?? '').trim();
  return Boolean(left) && left === right;
}

function isActive(item) {
  return normalizeStatus(item.status) !== 'encerrado';
}

function emTrabalho(item) {
  return item?.trabalhando === true;
}

function nomeFila(item) {
  const ref = refOf(item);
  return ref ? `${ref} · ${item.nome}` : item.nome;
}

function temFicha(item) {
  const ficha = item?.ficha;
  if (!ficha || typeof ficha !== 'object') return false;
  return Object.values(ficha).some((value) => String(value ?? '').trim());
}

function closeAllMais(except) {
  document.querySelectorAll('.mais-wrap.open').forEach((wrap) => {
    if (wrap === except) return;
    wrap.classList.remove('open');
    const btn = wrap.querySelector('[data-act="mais"]');
    const menu = wrap.querySelector('.mais-menu');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    if (menu) menu.hidden = true;
  });
}

function toggleMais(btn) {
  const wrap = btn.closest('.mais-wrap');
  if (!wrap) return;
  const menu = wrap.querySelector('.mais-menu');
  const open = wrap.classList.contains('open');
  closeAllMais();
  if (open || !menu) return;
  wrap.classList.add('open');
  btn.setAttribute('aria-expanded', 'true');
  menu.hidden = false;
}

function dataFicha(iso) {
  const raw = String(iso || '').trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1].slice(2)}`;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(2);
  return `${dd}/${mm}/${yy}`;
}

function showFichaFoto(slot, dataUrl) {
  const spec = FICHA_FOTOS[slot];
  if (!spec) return;
  fichaFotos[spec.key] = String(dataUrl || '');
  const has = fichaFotos[spec.key].startsWith('data:image');
  const preview = document.getElementById(spec.preview);
  const vazio = document.getElementById(spec.vazio);
  const limpar = document.getElementById(spec.limpar);
  preview.hidden = !has;
  vazio.hidden = has;
  limpar.hidden = !has;
  preview.src = has ? fichaFotos[spec.key] : '';
}

function clearFichaFotos() {
  Object.keys(FICHA_FOTOS).forEach((slot) => showFichaFoto(slot, ''));
}

function readFichaForm() {
  const ficha = {};
  for (const [id, key] of FICHA_FIELDS) {
    ficha[key] = document.getElementById(id).value.trim();
  }
  ficha.foto = fichaFotos.foto;
  ficha.foto_modelo = fichaFotos.foto_modelo;
  ficha.foto_ponto = fichaFotos.foto_ponto;
  return ficha;
}

function fillFichaForm(item) {
  const saved = item?.ficha && typeof item.ficha === 'object' ? item.ficha : {};
  const defaults = {
    cliente: saved.cliente || item.cliente || '',
    nome: saved.nome || item.nome || '',
    ref: saved.ref || refOf(item),
    data: saved.data || dataFicha(item.criado_em),
  };
  for (const [id, key] of FICHA_FIELDS) {
    document.getElementById(id).value = saved[key] || defaults[key] || '';
  }
  showFichaFoto('foto', saved.foto || '');
  showFichaFoto('modelo', saved.foto_modelo || '');
  showFichaFoto('ponto', saved.foto_ponto || '');
}

function openFicha(item) {
  fichaId = item.id;
  fichaErroEl.textContent = '';
  fillFichaForm(item);
  dlgFicha.hidden = false;
}

function closeFicha() {
  dlgFicha.hidden = true;
  fichaId = null;
  clearFichaFotos();
}

async function compressFichaFoto(file, slot = 'foto') {
  const spec = FICHA_FOTOS[slot] || FICHA_FOTOS.foto;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Não deu para ler a foto.'));
      image.src = url;
    });
    const max = spec.maxPx;
    let width = img.width || 1;
    let height = img.height || 1;
    if (width > max || height > max) {
      const ratio = Math.min(max / width, max / height);
      width = Math.max(1, Math.round(width * ratio));
      height = Math.max(1, Math.round(height * ratio));
    }
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let quality = 0.7;
    let data = '';
    for (let attempt = 0; attempt < 6; attempt += 1) {
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      data = canvas.toDataURL('image/jpeg', quality);
      if (data.length <= spec.maxChars) break;
      quality = Math.max(0.36, quality - 0.1);
      if (data.length > spec.maxChars) {
        width = Math.max(280, Math.round(width * 0.82));
        height = Math.max(280, Math.round(height * 0.82));
      }
    }
    if (data.length > spec.maxChars + 80000) {
      throw new Error('A foto ainda ficou grande. Tire mais de perto ou escolha outra.');
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function onFichaFoto(file, slot = 'foto') {
  if (!file) return;
  fichaErroEl.textContent = '';
  try {
    showFichaFoto(slot, await compressFichaFoto(file, slot));
  } catch (err) {
    fichaErroEl.textContent = err instanceof Error ? err.message : 'Não deu para importar a foto.';
  }
}

async function saveFicha() {
  if (!fichaId) return false;
  fichaErroEl.textContent = '';
  const item = items.find((row) => row.id === fichaId);
  if (!item) {
    fichaErroEl.textContent = 'Esse desenvolvimento não está mais na lista.';
    return false;
  }
  const ficha = readFichaForm();
  const patch = {
    ficha,
    atualizado_em: new Date().toISOString(),
  };
  if (ficha.nome) patch.nome = ficha.nome;
  if (ficha.cliente) patch.cliente = ficha.cliente;
  if (ficha.ref) {
    patch.syntech_codigo = ficha.ref;
    patch.referencia = ficha.ref;
  }
  try {
    await db.collection(COL).doc(fichaId).update(patch);
    return true;
  } catch (err) {
    const msg = String(err?.message || err || '');
    fichaErroEl.textContent = msg.toLowerCase().includes('exceed') || msg.toLowerCase().includes('size')
      ? 'A foto ficou grande demais para salvar. Escolha outra ou tire de mais longe.'
      : (err instanceof Error ? err.message : 'Não deu para salvar a ficha.');
    return false;
  }
}

function printFicha() {
  const ficha = readFichaForm();
  const logo = new URL('./logo-tricot.jpeg', window.location.href).href;
  const val = (key) => esc(ficha[key] || '');
  const cell = (title, key) =>
    `<td class="lab"><div class="in"><b>${title}</b><span class="v">${val(key)}</span></div></td>`;
  const meta = (title, key) =>
    `<td><div class="in"><b>${title}</b><span class="v">${val(key)}</span></div></td>`;
  const prova = (title, d, l, s) =>
    `<tr>
      <td><b>${title}</b></td>
      <td><div class="in"><b>DATA:</b><span class="v">${val(d)}</span></div></td>
      <td><div class="in"><b>LACRE:</b><span class="v">${val(l)}</span></div></td>
      <td><div class="in"><b>STATUS:</b><span class="v">${val(s)}</span></div></td>
    </tr>`;
  const linhas = (n, text = '') => {
    const rows = [];
    for (let i = 0; i < n; i += 1) {
      rows.push(`<tr class="linha"><td colspan="4">${i === 0 ? text : ''}</td></tr>`);
    }
    return rows.join('');
  };
  const foto = ficha.foto && ficha.foto.startsWith('data:image')
    ? `<img src="${ficha.foto}" alt="Foto do modelo" />`
    : '';
  const imgRef = (src, alt) =>
    src && src.startsWith('data:image') ? `<img src="${src}" alt="${esc(alt)}" />` : '';
  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <title>Ficha técnica de estilo ${esc(ficha.ref || ficha.nome || '')}</title>
  <style>
    @page { size: A4 portrait; margin: 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; background: #fff; color: #111; font-family: Arial, Helvetica, sans-serif; }
    .pagina {
      width: 190mm; height: 277mm; overflow: hidden;
      display: flex; flex-direction: column;
    }
    .frente { page-break-after: always; break-after: page; }
    .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 8px; flex: 0 0 11mm; padding: 0 1mm; }
    h1 { margin: 0; font-size: 12pt; font-weight: 700; }
    .logo { width: 26mm; height: 10mm; object-fit: cover; object-position: center; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    td, th { border: 1px solid #111; padding: 0; font-size: 10pt; text-align: left; vertical-align: middle; color: #111; }
    .meta { flex: 0 0 auto; }
    .meta .a { width: 23%; } .meta .b { width: 38%; } .meta .c { width: 39%; }
    .meta td { height: 6.4mm; }
    .body { flex: 1 1 auto; height: 100%; }
    .body .labw { width: 23%; } .body .blankw { width: 77%; }
    .lab { height: 4.76%; }
    .cartela .lab { height: 14.3%; vertical-align: top; }
    .blank { height: 1px; padding: 0; vertical-align: top; }
    .stack { display: flex; flex-direction: column; height: 100%; }
    .croq, .foto { flex: 1 1 50%; min-height: 0; height: 50%; overflow: hidden; }
    .foto { border-top: 1px solid #111; }
    .in { display: flex; align-items: center; gap: 4px; box-sizing: border-box; width: 100%; height: 100%; padding: 1px 4px 1px 5px; }
    .in.col { align-items: flex-start; flex-direction: column; height: 100%; padding: 4px 6px; }
    b { flex: 0 0 auto; font-size: 10pt; font-weight: 700; line-height: 1.15; white-space: nowrap; }
    .cartela b { white-space: normal; }
    .v { font-weight: 400; min-width: 0; }
    .croq {
      background-image: repeating-linear-gradient(to bottom, #fff 0, #fff 5.6mm, #b5b5b5 5.6mm, #b5b5b5 5.8mm);
      white-space: pre-wrap; font-weight: 400; font-size: 10pt; padding: 3px 5px;
    }
    .foto img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
    .refs { flex: 0 0 58mm; height: 58mm; max-height: 58mm; min-height: 0; overflow: hidden; }
    .refs td { width: 50%; height: 58mm; max-height: 58mm; vertical-align: top; }
    .refbox { display: flex; flex-direction: column; height: 58mm; max-height: 58mm; min-height: 0; overflow: hidden; }
    .reftop { display: flex; align-items: center; gap: 6px; padding: 2px 6px; flex: 0 0 7mm; height: 7mm; }
    .refimg { flex: 1 1 auto; min-height: 0; height: 0; overflow: hidden; }
    .refimg img { display: block; width: 100%; height: 100%; max-height: 100%; object-fit: contain; object-position: center top; }
    .provas { flex: 1 1 auto; min-height: 0; }
    .sec { text-align: center; height: 8mm; letter-spacing: 0.04em; font-weight: 700; }
    .provas tr:not(.linha) td, .provas tr:not(.linha) th { height: 8mm; font-weight: 700; }
    .linha td { height: 9mm; font-weight: 400; padding: 0 5px; }
  </style>
</head>
<body>
  <article class="pagina frente">
    <header class="top">
      <h1>FICHA TÉCNICA DE ESTILO</h1>
      <img class="logo" src="${logo}" alt="Tricot & Cia" />
    </header>
    <table class="meta">
      <colgroup><col class="a" /><col class="b" /><col class="c" /></colgroup>
      <tr>${meta('Coleção:', 'colecao')}${meta('CLIENTE:', 'cliente')}${meta('REF:', 'ref')}</tr>
      <tr>${meta('Família:', 'familia')}${meta('Estilista:', 'estilista')}${meta('NOME:', 'nome')}</tr>
      <tr>${meta('Prioridade:', 'prioridade')}<td></td>${meta('DATA:', 'data')}</tr>
    </table>
    <table class="body">
      <colgroup><col class="labw" /><col class="blankw" /></colgroup>
      <tr>
        ${cell('PASSADORIA:', 'passadoria')}
        <td class="blank" rowspan="19">
          <div class="stack">
            <div class="croq">${val('notas')}</div>
            <div class="foto">${foto}</div>
          </div>
        </td>
      </tr>
      <tr>${cell('MÁQUINA:', 'maquina')}</tr>
      <tr>${cell('FIO 1:', 'fio1')}</tr>
      <tr>${cell('FIO 2:', 'fio2')}</tr>
      <tr>${cell('FIO 3:', 'fio3')}</tr>
      <tr class="cartela">${cell('Cartela/número/cor:', 'cartela')}</tr>
      <tr>${cell('Regulagem:', 'regulagem')}</tr>
      <tr>${cell('Nº cabos:', 'n_cabos')}</tr>
      <tr>${cell('Barra:', 'barra')}</tr>
      <tr>${cell('Punho:', 'punho')}</tr>
      <tr>${cell('Frente:', 'frente')}</tr>
      <tr>${cell('Costas:', 'costas')}</tr>
      <tr>${cell('Manga:', 'manga')}</tr>
      <tr>${cell('Acabamento:', 'acabamento')}</tr>
      <tr>${cell('Decote:', 'decote')}</tr>
      <tr>${cell('Etiqueta:', 'etiqueta')}</tr>
      <tr>${cell('Comprimento:', 'comprimento')}</tr>
      <tr>${cell('Largura:', 'largura')}</tr>
      <tr>${cell('Aviamento:', 'aviamento')}</tr>
    </table>
  </article>
  <article class="pagina verso">
    <table class="refs">
      <tr>
        <td>
          <div class="refbox">
            <div class="reftop"><b>Ref Modelo:</b><span class="v">${val('ref_modelo')}</span></div>
            <div class="refimg">${imgRef(ficha.foto_modelo, 'Ref modelo')}</div>
          </div>
        </td>
        <td>
          <div class="refbox">
            <div class="reftop"><b>Ref Ponto:</b><span class="v">${val('ref_ponto')}</span></div>
            <div class="refimg">${imgRef(ficha.foto_ponto, 'Ref ponto')}</div>
          </div>
        </td>
      </tr>
    </table>
    <table class="provas">
      <tr><th colspan="4" class="sec">COMENTÁRIOS DE MODELAGEM</th></tr>
      ${prova('1ª PROVA', 'p1_data', 'p1_lacre', 'p1_status')}
      ${linhas(8, val('comentarios'))}
      ${prova('2ª PROVA', 'p2_data', 'p2_lacre', 'p2_status')}
      ${linhas(5)}
      ${prova('3ª PROVA', 'p3_data', 'p3_lacre', 'p3_status')}
      ${linhas(8)}
    </table>
  </article>
</body>
</html>`;
  const frame = document.getElementById('ficha-print-frame');
  const doc = frame.contentDocument;
  doc.open();
  doc.write(html);
  doc.close();
  const run = () => {
    frame.contentWindow.focus();
    frame.contentWindow.print();
  };
  const imgs = [...doc.images];
  if (!imgs.length) {
    setTimeout(run, 80);
    return;
  }
  let left = imgs.length;
  const tick = () => {
    left -= 1;
    if (left <= 0) setTimeout(run, 50);
  };
  imgs.forEach((img) => {
    if (img.complete) tick();
    else {
      img.onload = tick;
      img.onerror = tick;
    }
  });
}

function trabalhosDoSetor(tab) {
  return orderedIn(tab).filter(emTrabalho);
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

async function writeOrdem(ordered, alertaId) {
  const now = new Date().toISOString();
  const batch = db.batch();
  let writes = 0;
  ordered.forEach((item, i) => {
    const prio = i + 1;
    const alerta = Boolean(alertaId && item.id === alertaId);
    const prioMudou = Number(item.prioridade) !== prio;
    if (!prioMudou && !alerta) return;
    const patch = { atualizado_em: now };
    if (prioMudou) patch.prioridade = prio;
    if (alerta) {
      patch.prio_alerta = true;
      patch.prio_alerta_em = now;
    }
    batch.update(db.collection(COL).doc(item.id), patch);
    writes += 1;
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

function refreshPosicaoField() {
  const el = document.getElementById('f-posicao');
  if (!el) return;
  const setor = setorSel.value || 'estilo';
  const fila = orderedIn(setor).filter((item) => item.id !== editingId);
  const max = Math.max(1, fila.length + 1);
  el.min = '1';
  el.max = String(max);
  const current = editingId ? items.find((item) => item.id === editingId) : null;
  if (current && normalizeStatus(current.status) === setor) {
    const pos = orderedIn(setor).findIndex((item) => item.id === editingId) + 1;
    el.value = String(pos || max);
    return;
  }
  el.value = String(max);
}

async function colocarNaPosicao(id, tab, posRaw) {
  const atual = orderedIn(tab);
  const oldPos = atual.findIndex((row) => row.id === id) + 1;
  const fila = atual.filter((item) => item.id !== id);
  const item = items.find((row) => row.id === id) ?? { id };
  const max = fila.length + 1;
  const pos = Math.max(1, Math.min(max, Number(posRaw) || max));
  const isNew = oldPos === 0;
  const mudou = tab !== 'encerrado' && ((!isNew && oldPos !== pos) || (isNew && pos !== max));
  fila.splice(pos - 1, 0, item);
  await writeOrdem(fila, mudou ? id : null);
}

function temPrioAlerta(item) {
  return item?.prio_alerta === true;
}

async function vistoPrioridade(tab) {
  const now = new Date().toISOString();
  const batch = db.batch();
  let writes = 0;
  orderedIn(tab).forEach((row) => {
    if (!temPrioAlerta(row)) return;
    batch.update(db.collection(COL).doc(row.id), {
      prio_alerta: false,
      prio_alerta_visto_em: now,
      atualizado_em: now,
    });
    writes += 1;
  });
  if (writes) await batch.commit();
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
  refreshPosicaoField();
  suggestedTipo = item?.tipo || 'novo';
  refHintEl.textContent = '';
  refHintEl.classList.remove('existente');
  document.getElementById('dlg-apagar').hidden = !editingId;
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
      const busy = tab.id !== 'encerrado' && trabalhosDoSetor(tab.id).length ? ' tem-trabalho' : '';
      const prio = tab.id !== 'encerrado' && items.some((item) => inTab(item, tab.id) && temPrioAlerta(item))
        ? ' tem-prio'
        : '';
      return `<button type="button" class="aba${on}${busy}${prio}" data-tab="${esc(tab.id)}">${esc(tab.label)}<span class="n">${n}</span></button>`;
    })
    .join('');
}

function renderAgora() {
  const abertos = STATUS.flatMap((tab) =>
    trabalhosDoSetor(tab.id).map((item) => ({ tab, item }))
  );
  if (!abertos.length) {
    agoraEl.hidden = true;
    agoraEl.innerHTML = '';
    return;
  }
  agoraEl.hidden = false;
  agoraEl.innerHTML = `<span class="agora-label">Em trabalho</span>${abertos
    .map(
      ({ tab, item }) =>
        `<button type="button" class="agora-item" data-tab="${esc(tab.id)}">${esc(tab.label)} · ${esc(nomeFila(item))}</button>`
    )
    .join('')}`;
}

function render() {
  if (!STATUS.some((s) => s.id === activeTab) && activeTab !== 'encerrado') activeTab = 'estilo';
  renderAbas();
  renderAgora();
  const ordered = orderedIn(activeTab);
  const tabName = statusLabel(activeTab);
  resumoEl.textContent =
    activeTab === 'encerrado'
      ? `${ordered.length} encerrado(s)`
      : ordered.length
        ? `${ordered.length} em ${tabName} · o número à esquerda é a posição na fila`
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

  const alertaFila = activeTab !== 'encerrado' && ordered.some(temPrioAlerta);
  const avisoPrio = alertaFila
    ? `<div class="prio-aviso">
        <span>Mudança na prioridade</span>
        <button type="button" class="btn go sm" data-act="visto-prio">OK, vi a mudança</button>
      </div>`
    : '';

  listaEl.innerHTML = avisoPrio + ordered
    .map((item, index) => {
      const cliente = item.cliente ? esc(item.cliente) : 'sem cliente';
      const obs = item.obs ? `<div class="meta">${esc(item.obs)}</div>` : '';
      const status = normalizeStatus(item.status);
      const aberto = emTrabalho(item);
      const voltarBtn = PREV[status]
        ? `<button type="button" class="btn ghost sm" data-act="voltar-setor">Voltar setor</button>`
        : '';
      const abrirBtn =
        status === 'encerrado'
          ? ''
          : aberto
            ? `<button type="button" class="btn warn sm" data-act="fechar">Fechar</button>`
            : `<button type="button" class="btn sm" data-act="abrir">Abrir</button>`;
      const okBtn =
        status === 'cliente'
          ? `${voltarBtn}
             <button type="button" class="btn warn sm" data-act="voltar">Voltou</button>
             <button type="button" class="btn ghost sm" data-act="encerrar">Encerrar</button>`
          : status === 'encerrado'
            ? ''
            : `${voltarBtn}<button type="button" class="btn go sm" data-act="ok">${esc(OK_LABEL)}</button>`;
      const maisMenu = `<div class="mais-wrap">
          <button type="button" class="btn ghost sm" data-act="mais" aria-expanded="false">Mais</button>
          <div class="mais-menu" hidden>
            <button type="button" class="btn ghost sm" data-act="ficha">Ficha</button>
            <button type="button" class="btn ghost sm" data-act="ficha-custo">Ficha custos</button>
            <button type="button" class="btn ghost sm" data-act="syncad">Cadastro Syntech</button>
            <button type="button" class="btn ghost sm" data-act="edit">Editar</button>
            <button type="button" class="btn ghost sm danger" data-act="apagar">Apagar</button>
          </div>
        </div>`;
      return `<article class="card${aberto ? ' trabalho' : ''}${temPrioAlerta(item) ? ' prio-alerta' : ''}" data-id="${esc(item.id)}">
        <div class="prio">
          ${
            status === 'encerrado'
              ? index + 1
              : `<input class="prio-in" data-act="pos" type="number" min="1" max="${ordered.length}" step="1" value="${index + 1}" aria-label="Posição na fila" />`
          }
        </div>
        <div>
          <div class="nome">${refOf(item) ? `<span class="ref-tag">${esc(refOf(item))}</span>` : ''}${esc(item.nome)}</div>
          <div class="meta">${cliente}</div>
          <div class="selos">
            ${aberto ? '<span class="selo trabalho">Em trabalho</span>' : ''}
            ${temPrioAlerta(item) ? '<span class="selo prio">Prioridade</span>' : ''}
            ${temFicha(item) ? '<span class="selo ficha">Ficha</span>' : ''}
            <span class="selo tipo">${esc(tipoLabel(item))}</span>
          </div>
          ${obs}
        </div>
        <div class="acoes">
          <div class="acoes-setor">
            ${abrirBtn}
            ${okBtn}
          </div>
          ${maisMenu}
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
    return editingId;
  }
  const status = payload.status || 'estilo';
  const doc = await db.collection(COL).add({
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
  return doc.id;
}

async function setTrabalhando(item, on) {
  await db.collection(COL).doc(item.id).update({
    trabalhando: on,
    atualizado_em: new Date().toISOString(),
  });
}

async function avancar(item) {
  const de = normalizeStatus(item.status);
  const para = NEXT[de];
  if (!para) return;
  await db.collection(COL).doc(item.id).update({
    status: para,
    prioridade: nextPrioridade(para),
    trabalhando: false,
    prio_alerta: false,
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
    trabalhando: false,
    prio_alerta: false,
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
    trabalhando: false,
    prio_alerta: false,
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
    trabalhando: false,
    prio_alerta: false,
    historico: pushHist(item, 'encerrar', de, 'encerrado'),
    atualizado_em: new Date().toISOString(),
  });
}

function nomeApagar(item) {
  return [refOf(item), item?.nome].filter(Boolean).join(' — ') || 'este modelo';
}

async function apagar(item) {
  if (!item?.id) return;
  if (!window.confirm(`Apagar ${nomeApagar(item)} da fila?\n\nSai de todos os PCs. Não dá para desfazer.`)) return;
  try {
    await db.collection(COL).doc(item.id).delete();
    if (editingId === item.id) closeDialog();
    if (fichaId === item.id) closeFicha();
  } catch (err) {
    showAviso(err instanceof Error ? err.message : 'Não deu para apagar.');
  }
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

async function readNuvemJson(col, id) {
  const snap = await db.collection(col).doc(id).get();
  if (!snap.exists) return null;
  const json = snap.data()?.json;
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

async function loadSyntech(busca) {
  synErro.textContent = '';
  synLista.innerHTML = '<p class="empty">Buscando no Syntech…</p>';
  try {
    if (syntechLocal) {
      const q = busca ? `?q=${encodeURIComponent(busca)}` : '';
      const res = await fetch(`/api/programs/desenv-pendentes${q}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não deu para ler o Syntech.');
      syntechItens = Array.isArray(data.itens) ? data.itens : [];
    } else {
      const data = await readNuvemJson('syntech_catalog', 'pendentes');
      const itens = Array.isArray(data?.itens) ? data.itens : [];
      const q = String(busca ?? '').trim().toLowerCase();
      syntechItens = q
        ? itens.filter(
            (row) =>
              String(row.codigo ?? '').toLowerCase().includes(q) ||
              String(row.nome ?? '').toLowerCase().includes(q)
          )
        : itens;
    }
    renderSyntech();
  } catch (err) {
    syntechItens = [];
    synLista.innerHTML = '';
    synErro.textContent = err instanceof Error ? err.message : 'Não deu para ler o Syntech.';
  }
}

async function probeSyntech() {
  syntechLocal = false;
  syntechOk = false;
  try {
    const res = await fetch('/api/programs/desenv-pendentes');
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.itens)) {
      syntechOk = true;
      syntechLocal = true;
    }
  } catch {
    syntechOk = false;
  }
  if (!syntechOk && db) {
    try {
      const opcoes = await readNuvemJson('syntech_catalog', 'opcoes');
      syntechOk = Boolean(opcoes && (opcoes.classificacoes || opcoes.ncms));
    } catch {
      syntechOk = false;
    }
  }
  btnSyntech.hidden = !syntechOk;
  btnCadSyntech.hidden = !syntechOk;
  btnVerSyncad.hidden = !syntechOk;
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

function padCod(n) {
  return String(n).padStart(4, '0');
}

function fillLookup(selectId, rows, selected, ncm = false) {
  const el = document.getElementById(selectId);
  const opts = Array.isArray(rows) ? rows : [];
  el.innerHTML = opts
    .map((row) => {
      const codigo = ncm ? String(row.codigo ?? '') : String(row.codigo ?? '');
      const label = ncm
        ? codigo
        : `${padCod(row.codigo)} ${row.nome || ''}`.trim();
      const on = String(selected ?? '') === codigo ? ' selected' : '';
      return `<option value="${esc(codigo)}"${on}>${esc(label)}</option>`;
    })
    .join('');
}

async function loadCadOpcoes() {
  if (syntechLocal) {
    const res = await fetch('/api/programs/desenv-produto-opcoes');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não deu para ler as opções do Syntech.');
    cadOpcoes = data;
  } else {
    const data = await readNuvemJson('syntech_catalog', 'opcoes');
    if (!data) throw new Error('Ainda não chegou o cadastro do Syntech. Deixe o Estoque ligado (Iniciar.bat).');
    cadOpcoes = data;
  }
  const d = cadOpcoes.defaults || {};
  fillLookup('cad-classificacao', cadOpcoes.classificacoes, d.classificacao);
  fillLookup('cad-grupo', cadOpcoes.grupos, d.grupo);
  fillLookup('cad-fornecedor', cadOpcoes.fornecedores, d.fornecedor);
  fillLookup('cad-funcionario', cadOpcoes.funcionarios, d.funcionario);
  fillLookup('cad-ncm', cadOpcoes.ncms, d.ncm, true);
}

async function openCadDialog() {
  cadErro.textContent = '';
  document.getElementById('cad-codigo').value = '';
  document.getElementById('cad-nome').value = '';
  document.getElementById('cad-lancar').checked = true;
  document.getElementById('cad-salvar').disabled = true;
  dlgCad.hidden = false;
  document.getElementById('cad-codigo').focus();
  try {
    await loadCadOpcoes();
    document.getElementById('cad-salvar').disabled = false;
  } catch (err) {
    cadErro.textContent = err instanceof Error ? err.message : 'Não deu para ler o Syntech.';
  }
}

function closeCadDialog() {
  dlgCad.hidden = true;
  cadBusy = false;
  document.getElementById('cad-salvar').disabled = false;
}

let syncadNovo = false;
let syncadOpcoes = null;
let syncadForm = null;

function emptySyncad(codigo) {
  return {
    codigo: codigo || '',
    nome: '',
    unidade: 'PC',
    peso_bruto: 0,
    peso_liquido: 0,
    classificacao: null,
    grupo: null,
    fornecedor: null,
    funcionario: null,
    ncm: '',
    estoque_minimo: 0,
    dias_entrega: 0,
    observacoes: '',
    programa: '',
    maquina: null,
    bicos: Array.from({ length: 10 }, (_, i) => ({
      bico: i + 1,
      parte: '',
      tipo_fio: null,
      perc: null,
      cabo: null,
      peso: null,
    })),
    partes: [],
    cores: [],
    guias: Array.from({ length: 8 }, (_, i) => ({
      numero: i + 1,
      esquerda: '',
      cabo: '',
      direita: '',
      cabod: '',
      cor_do_fio: '',
    })),
    tempos: Array.from({ length: 8 }, (_, i) => ({
      numero: i + 1,
      descricao: '',
      tempo: '',
      peso: null,
    })),
  };
}

function numVal(el) {
  const n = Number(String(el.value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

async function waitFilaSyntech(docRef, timeoutMsg) {
  for (let i = 0; i < 45; i += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 800));
    const snap = await docRef.get();
    const row = snap.data() || {};
    if (row.status === 'ok') return row;
    if (row.status === 'erro') throw new Error(row.erro || 'Não deu para falar com o Syntech.');
  }
  throw new Error(
    timeoutMsg || 'O Syntech não respondeu. Deixe o Estoque ligado (Iniciar.bat).'
  );
}

async function loadSyncadOpcoes() {
  if (syntechLocal) {
    const res = await fetch('/api/programs/syntech-produto-opcoes');
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não deu para ler as opções do Syntech.');
    syncadOpcoes = data;
  } else {
    const data = await readNuvemJson('syntech_catalog', 'opcoes');
    if (!data) throw new Error('Ainda não chegou o cadastro do Syntech. Deixe o Estoque ligado (Iniciar.bat).');
    syncadOpcoes = data;
  }
  fillLookup('sc-classificacao', syncadOpcoes.classificacoes, syncadForm?.classificacao);
  fillLookup('sc-grupo', syncadOpcoes.grupos, syncadForm?.grupo);
  fillLookup('sc-fornecedor', syncadOpcoes.fornecedores, syncadForm?.fornecedor);
  fillLookup('sc-funcionario', syncadOpcoes.funcionarios, syncadForm?.funcionario);
  fillLookup('sc-ncm', syncadOpcoes.ncms, syncadForm?.ncm, true);
  ['sc-classificacao', 'sc-grupo', 'sc-fornecedor', 'sc-funcionario', 'sc-ncm'].forEach((id) => {
    const el = document.getElementById(id);
    if (el && ![...el.options].some((opt) => opt.value === '')) {
      el.insertAdjacentHTML('afterbegin', '<option value="">—</option>');
    }
  });
  const maq = document.getElementById('sc-maquina');
  maq.innerHTML = `<option value="">—</option>${(syncadOpcoes.maquinas || [])
    .map(
      (row) =>
        `<option value="${esc(row.numero)}"${Number(syncadForm?.maquina) === Number(row.numero) ? ' selected' : ''}>${esc(`${String(row.numero).padStart(4, '0')} ${row.nome || ''}`)}</option>`
    )
    .join('')}`;
}

function tipoFioOptions(selected) {
  return `<option value="">—</option>${(syncadOpcoes?.tipos_fio || [])
    .map(
      (row) =>
        `<option value="${esc(row.codigo)}"${Number(selected) === Number(row.codigo) ? ' selected' : ''}>${esc(`${row.codigo} ${row.nome || ''}`)}</option>`
    )
    .join('')}`;
}

function paintSyncadLists() {
  document.getElementById('sc-bicos').innerHTML = (syncadForm.bicos || [])
    .map(
      (row) => `<tr>
        <td>${row.bico}</td>
        <td><input data-sc-bico="${row.bico}" data-k="parte" value="${esc(row.parte || '')}" /></td>
        <td><select data-sc-bico="${row.bico}" data-k="tipo_fio">${tipoFioOptions(row.tipo_fio)}</select></td>
        <td><input data-sc-bico="${row.bico}" data-k="perc" value="${row.perc ?? ''}" /></td>
        <td><input data-sc-bico="${row.bico}" data-k="cabo" value="${row.cabo ?? ''}" /></td>
        <td><input data-sc-bico="${row.bico}" data-k="peso" value="${row.peso ?? ''}" /></td>
      </tr>`
    )
    .join('');
  document.getElementById('sc-guias').innerHTML = (syncadForm.guias || [])
    .map(
      (row) => `<tr>
        <td>${row.numero}</td>
        <td><input data-sc-guia="${row.numero}" data-k="cabo" value="${esc(row.cabo || '')}" /></td>
        <td><input data-sc-guia="${row.numero}" data-k="esquerda" value="${esc(row.esquerda || '')}" /></td>
        <td><input data-sc-guia="${row.numero}" data-k="cabod" value="${esc(row.cabod || '')}" /></td>
        <td><input data-sc-guia="${row.numero}" data-k="direita" value="${esc(row.direita || '')}" /></td>
        <td><input data-sc-guia="${row.numero}" data-k="cor_do_fio" value="${esc(row.cor_do_fio || '')}" /></td>
      </tr>`
    )
    .join('');
  document.getElementById('sc-tempos').innerHTML = (syncadForm.tempos || [])
    .map(
      (row) => `<tr>
        <td>${row.numero}</td>
        <td><input data-sc-tempo="${row.numero}" data-k="descricao" value="${esc(row.descricao || '')}" /></td>
        <td><input data-sc-tempo="${row.numero}" data-k="tempo" placeholder="mm:ss" value="${esc(row.tempo || '')}" /></td>
        <td><input data-sc-tempo="${row.numero}" data-k="peso" value="${row.peso ?? ''}" /></td>
      </tr>`
    )
    .join('');
  document.getElementById('sc-partes').innerHTML = (syncadForm.partes || [])
    .map(
      (row, i) => `<div class="ficha-grid2" style="margin-bottom:6px">
        <input data-sc-parte="${i}" data-k="parte" placeholder="Parte" value="${esc(row.parte || '')}" />
        <input data-sc-parte="${i}" data-k="quant" placeholder="Qtd" value="${row.quant ?? 1}" />
      </div>`
    )
    .join('');
  document.getElementById('sc-cores').innerHTML = (syncadForm.cores || [])
    .map(
      (row, i) => `<div class="ficha-grid2" style="margin-bottom:6px">
        <input data-sc-cor="${i}" data-k="cor" placeholder="Cód." value="${row.cor || ''}" />
        <input data-sc-cor="${i}" data-k="nome" placeholder="Nome" value="${esc(row.nome || '')}" />
      </div>`
    )
    .join('');
}

function paintSyncadCabecalho() {
  const f = syncadForm;
  document.getElementById('syncad-codigo').value = f.codigo || '';
  document.getElementById('sc-nome').value = f.nome || '';
  document.getElementById('sc-unidade').value = f.unidade || 'PC';
  document.getElementById('sc-peso-bruto').value = f.peso_bruto ?? '';
  document.getElementById('sc-peso-liq').value = f.peso_liquido ?? '';
  document.getElementById('sc-est-min').value = f.estoque_minimo ?? '';
  document.getElementById('sc-dias').value = f.dias_entrega ?? '';
  document.getElementById('sc-obs').value = f.observacoes || '';
  document.getElementById('sc-programa').value = f.programa || '';
  document.getElementById('sc-classificacao').value = f.classificacao ?? '';
  document.getElementById('sc-grupo').value = f.grupo ?? '';
  document.getElementById('sc-fornecedor').value = f.fornecedor ?? '';
  document.getElementById('sc-funcionario').value = f.funcionario ?? '';
  document.getElementById('sc-ncm').value = f.ncm || '';
  document.getElementById('sc-maquina').value = f.maquina ?? '';
}

function collectSyncad() {
  const form = emptySyncad(document.getElementById('syncad-codigo').value.trim());
  form.nome = document.getElementById('sc-nome').value.trim();
  form.unidade = document.getElementById('sc-unidade').value.trim() || 'PC';
  form.peso_bruto = numVal(document.getElementById('sc-peso-bruto')) ?? 0;
  form.peso_liquido = numVal(document.getElementById('sc-peso-liq')) ?? 0;
  form.classificacao = numVal(document.getElementById('sc-classificacao'));
  form.grupo = numVal(document.getElementById('sc-grupo'));
  form.fornecedor = numVal(document.getElementById('sc-fornecedor'));
  form.funcionario = numVal(document.getElementById('sc-funcionario'));
  form.ncm = document.getElementById('sc-ncm').value.trim();
  form.estoque_minimo = numVal(document.getElementById('sc-est-min')) ?? 0;
  form.dias_entrega = numVal(document.getElementById('sc-dias')) ?? 0;
  form.observacoes = document.getElementById('sc-obs').value.trim();
  form.programa = document.getElementById('sc-programa').value.trim();
  form.maquina = numVal(document.getElementById('sc-maquina'));
  form.bicos = [...document.querySelectorAll('#sc-bicos tr')].map((tr, i) => ({
    bico: i + 1,
    parte: tr.querySelector('[data-k=parte]')?.value.trim() || '',
    tipo_fio: numVal(tr.querySelector('[data-k=tipo_fio]')),
    perc: numVal(tr.querySelector('[data-k=perc]')),
    cabo: numVal(tr.querySelector('[data-k=cabo]')),
    peso: numVal(tr.querySelector('[data-k=peso]')),
  }));
  form.guias = [...document.querySelectorAll('#sc-guias tr')].map((tr, i) => ({
    numero: i + 1,
    cabo: tr.querySelector('[data-k=cabo]')?.value.trim() || '',
    esquerda: tr.querySelector('[data-k=esquerda]')?.value.trim() || '',
    cabod: tr.querySelector('[data-k=cabod]')?.value.trim() || '',
    direita: tr.querySelector('[data-k=direita]')?.value.trim() || '',
    cor_do_fio: tr.querySelector('[data-k=cor_do_fio]')?.value.trim() || '',
  }));
  form.tempos = [...document.querySelectorAll('#sc-tempos tr')].map((tr, i) => ({
    numero: i + 1,
    descricao: tr.querySelector('[data-k=descricao]')?.value.trim() || '',
    tempo: tr.querySelector('[data-k=tempo]')?.value.trim() || '',
    peso: numVal(tr.querySelector('[data-k=peso]')),
  }));
  const parteN = document.querySelectorAll('#sc-partes [data-sc-parte][data-k=parte]').length;
  form.partes = [];
  for (let i = 0; i < parteN; i += 1) {
    const parte = document.querySelector(`[data-sc-parte="${i}"][data-k=parte]`)?.value.trim() || '';
    const quant = numVal(document.querySelector(`[data-sc-parte="${i}"][data-k=quant]`)) ?? 1;
    if (parte) form.partes.push({ parte, quant });
  }
  const corN = document.querySelectorAll('#sc-cores [data-sc-cor][data-k=cor]').length;
  form.cores = [];
  for (let i = 0; i < corN; i += 1) {
    const cor = numVal(document.querySelector(`[data-sc-cor="${i}"][data-k=cor]`)) ?? 0;
    const nome = document.querySelector(`[data-sc-cor="${i}"][data-k=nome]`)?.value.trim() || '';
    if (cor) form.cores.push({ cor, nome, principal: i === 0 });
  }
  return form;
}

async function fetchSyncad(codigo) {
  if (syntechLocal) {
    const res = await fetch(`/api/programs/syntech-produto/${encodeURIComponent(codigo)}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || 'Não achei esse produto no Syntech.');
    return data;
  }
  const data = await readNuvemJson('syntech_produtos', codigo);
  if (data && (data.codigo || data.nome)) return data;
  throw new Error('Cadastro ainda não está na nuvem. Abra o código no Estoque (Desenv-Cadastro → Cadastro Syntech).');
}

async function openSyncad(codigo) {
  const erro = document.getElementById('syncad-erro');
  erro.textContent = '';
  syncadNovo = !codigo;
  syncadForm = emptySyncad(codigo || '');
  dlgSyncad.hidden = false;
  document.getElementById('syncad-codigo').value = codigo || '';
  try {
    await loadSyncadOpcoes();
    if (codigo) {
      syncadForm = await fetchSyncad(codigo);
      syncadNovo = false;
    }
    paintSyncadLists();
    paintSyncadCabecalho();
    erro.textContent = '';
  } catch (err) {
    paintSyncadLists();
    paintSyncadCabecalho();
    erro.textContent = err instanceof Error ? err.message : 'Não deu para abrir o cadastro.';
  }
}

async function saveSyncad() {
  const erro = document.getElementById('syncad-erro');
  erro.textContent = '';
  const form = collectSyncad();
  if (!form.codigo || !form.nome) {
    erro.textContent = 'Informe código e descrição.';
    return;
  }
  try {
    if (syntechLocal) {
      const url = syncadNovo
        ? '/api/programs/syntech-produto'
        : `/api/programs/syntech-produto/${encodeURIComponent(form.codigo)}`;
      const res = await fetch(url, {
        method: syncadNovo ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não deu para gravar no Syntech.');
      syncadNovo = false;
      document.getElementById('syncad-codigo').value = data.codigo || form.codigo;
      erro.textContent = `Gravado ${data.codigo || form.codigo}.`;
      return;
    }
    erro.textContent = 'Gravando…';
    const docRef = await db.collection('syntech_cadastros').add({
      status: 'pendente',
      acao: syncadNovo ? 'criar-completo' : 'salvar',
      codigo: form.codigo,
      nome: form.nome,
      json: JSON.stringify(form),
      criado_em: new Date().toISOString(),
    });
    const row = await waitFilaSyntech(
      docRef,
      'Não deu para gravar. Deixe o Estoque ligado (Iniciar.bat).'
    );
    syncadNovo = false;
    document.getElementById('syncad-codigo').value = row.codigo || form.codigo;
    erro.textContent = `Gravado ${row.codigo || form.codigo}.`;
  } catch (err) {
    erro.textContent = err instanceof Error ? err.message : 'Não deu para gravar no Syntech.';
  }
}

function isEnterField(el) {
  if (!el || el.disabled) return false;
  const tag = el.tagName;
  if (tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'TEXTAREA') return false;
  if (el.type === 'hidden' || el.type === 'file' || el.type === 'button' || el.type === 'submit') return false;
  if (el.hidden || el.closest('[hidden]')) return false;
  return true;
}

function fieldsIn(root) {
  return [...root.querySelectorAll('input, select, textarea')].filter(isEnterField);
}

function onEnterNextField(ev) {
  if (ev.key !== 'Enter' || ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const el = ev.target;
  if (!isEnterField(el)) return;
  if (el.tagName === 'TEXTAREA') return;
  ev.preventDefault();
  const root = el.closest('form, .dlg-card') || el.closest('.dlg');
  if (!root || root.id === 'login-form') return;
  const fields = fieldsIn(root);
  const i = fields.indexOf(el);
  const next = ev.shiftKey ? fields[i - 1] : fields[i + 1];
  if (next) {
    next.focus();
    if (next.tagName === 'INPUT' && typeof next.select === 'function' && next.type !== 'checkbox') {
      next.select();
    }
    return;
  }
  const submit = root.querySelector('#ficha-salvar, button[type="submit"]');
  if (submit) submit.focus();
}

function bindBackdropClose(overlay, closeFn) {
  let downOnBackdrop = false;
  overlay.addEventListener('pointerdown', (ev) => {
    downOnBackdrop = ev.target === overlay;
  });
  overlay.addEventListener('click', (ev) => {
    if (ev.target !== overlay || !downOnBackdrop) return;
    downOnBackdrop = false;
    if (window.getSelection && window.getSelection().toString()) return;
    closeFn();
  });
}

async function submitCadastro(ev) {
  ev.preventDefault();
  if (cadBusy) return;
  const codigo = document.getElementById('cad-codigo').value.trim();
  const nome = document.getElementById('cad-nome').value.trim();
  const classificacao = Number(document.getElementById('cad-classificacao').value);
  const grupo = Number(document.getElementById('cad-grupo').value);
  const fornecedor = Number(document.getElementById('cad-fornecedor').value);
  const funcionario = Number(document.getElementById('cad-funcionario').value);
  const ncm = document.getElementById('cad-ncm').value.trim();
  const lancar = document.getElementById('cad-lancar').checked;
  cadErro.textContent = '';
  if (!codigo || !nome) {
    cadErro.textContent = 'Informe código e descrição.';
    return;
  }
  cadBusy = true;
  document.getElementById('cad-salvar').disabled = true;
  try {
    let ref = codigo;
    let modelo = nome;
    if (syntechLocal) {
      const res = await fetch('/api/programs/desenv-cadastrar-produto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          codigo,
          nome,
          classificacao,
          grupo,
          fornecedor,
          funcionario,
          ncm,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não deu para cadastrar no Syntech.');
      ref = String(data.codigo || codigo).trim();
      modelo = String(data.nome || nome).trim();
    } else {
      cadErro.textContent = 'Cadastrando…';
      const docRef = await db.collection('syntech_cadastros').add({
        status: 'pendente',
        codigo,
        nome,
        classificacao,
        grupo,
        fornecedor,
        funcionario,
        ncm,
        lancar,
        criado_em: new Date().toISOString(),
      });
      let done = null;
      for (let i = 0; i < 45; i += 1) {
        await new Promise((resolve) => window.setTimeout(resolve, 800));
        const snap = await docRef.get();
        const row = snap.data() || {};
        if (row.status === 'ok') {
          done = row;
          break;
        }
        if (row.status === 'erro') {
          throw new Error(row.erro || 'Não deu para cadastrar no Syntech.');
        }
      }
      if (!done) {
        throw new Error('Não deu para cadastrar. Deixe o Estoque ligado (Iniciar.bat).');
      }
      ref = String(done.codigo || codigo).trim();
      modelo = String(done.nome || nome).trim();
    }
    if (lancar && !jaNaFila(ref)) {
      editingId = null;
      await saveItem({
        nome: modelo,
        cliente: '',
        status: 'estilo',
        tipo: 'novo',
        tipo_texto: '',
        ajuste_n: 0,
        obs: `Cadastrado no Syntech ${ref}`,
        syntech_codigo: ref,
        referencia: ref,
      });
      activeTab = 'estilo';
      sessionStorage.setItem('desenv-aba', activeTab);
    }
    closeCadDialog();
    showAviso(
      lancar
        ? `${ref} cadastrado no Syntech e lançado na fila.`
        : `${ref} cadastrado no Syntech.`
    );
  } catch (err) {
    cadErro.textContent = err instanceof Error ? err.message : 'Não deu para cadastrar no Syntech.';
    document.getElementById('cad-salvar').disabled = false;
    cadBusy = false;
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
const MENSAGEIRO_DOMAIN = 'mensageiro.controle-tricot-e-cia.web.app';

function isFabricaEmail(email) {
  return String(email ?? '')
    .trim()
    .toLowerCase()
    .endsWith(`@${MENSAGEIRO_DOMAIN}`);
}

function senhaParaAuth(senha) {
  const s = String(senha ?? '').trim();
  return s === '1234' ? '1234xx' : s;
}

function estoqueUrl() {
  const host = location.hostname;
  if (host === '127.0.0.1' || host === 'localhost') return 'http://127.0.0.1:3847/';
  return '/';
}

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
  if (raw.includes('@')) return raw;
  const login = raw.replace(/[^a-z0-9._-]+/g, '');
  if (login.length >= 3) return `${login}@${MENSAGEIRO_DOMAIN}`;
  return (value ?? '').trim();
}

function nomeDoEmail(email) {
  const raw = String(email ?? '').trim().toLowerCase();
  if (raw === DESENV_LOGIN_EMAIL) return DESENV_LOGIN_USER;
  const at = raw.indexOf('@');
  return at > 0 ? raw.slice(0, at) : raw;
}

function showApp(user) {
  loginEl.hidden = true;
  appEl.hidden = false;
  const el = document.getElementById('user-email');
  el.textContent = nomeDoEmail(user.email);
  if (user.uid && db) {
    db.collection('mensageiro_pessoas')
      .doc(user.uid)
      .get()
      .then((snap) => {
        const nome = String(snap.data()?.nome ?? '').trim();
        if (nome) el.textContent = nome;
      })
      .catch(() => undefined);
    const bater = () => {
      db.collection('mensageiro_presenca')
        .doc(user.uid)
        .set({ visto_em: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true })
        .catch(() => undefined);
    };
    bater();
    window.setInterval(bater, 20000);
  }
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
      senhaParaAuth(document.getElementById('login-pass').value)
    );
  } catch {
    erro.textContent = 'Usuário ou senha incorretos.';
  }
});
const linkEstoque = document.getElementById('link-estoque');
if (linkEstoque) linkEstoque.href = estoqueUrl();

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
document.getElementById('btn-cad-syntech').addEventListener('click', () => {
  void openCadDialog();
});
document.getElementById('btn-ver-syncad').addEventListener('click', () => {
  void openSyncad('');
});
document.getElementById('btn-ficha-custo').addEventListener('click', () => {
  openFichaCusto('');
});
document.getElementById('cad-cancelar').addEventListener('click', closeCadDialog);
bindBackdropClose(dlgCad, closeCadDialog);
cadForm.addEventListener('submit', (ev) => {
  void submitCadastro(ev);
});
form.addEventListener('keydown', onEnterNextField);
cadForm.addEventListener('keydown', onEnterNextField);
dlgFicha.addEventListener('keydown', onEnterNextField);
document.getElementById('syn-fechar').addEventListener('click', () => {
  dlgSyn.hidden = true;
});
bindBackdropClose(dlgSyn, () => {
  dlgSyn.hidden = true;
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
document.getElementById('dlg-apagar').addEventListener('click', () => {
  const item = items.find((row) => row.id === editingId);
  if (item) void apagar(item);
});
bindBackdropClose(dlg, closeDialog);
tipoSel.addEventListener('change', () => {
  tipoOutroWrap.hidden = tipoSel.value !== 'outro';
});
setorSel.addEventListener('change', () => {
  refreshPosicaoField();
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
      payload.trabalhando = false;
      payload.prio_alerta = false;
      payload.historico = pushHist(current, 'moveu', current.status, setor);
    }
    const id = await saveItem(payload);
    activeTab = setor;
    sessionStorage.setItem('desenv-aba', activeTab);
    const posicao = document.getElementById('f-posicao').value.trim();
    if (id) await colocarNaPosicao(id, setor, posicao);
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

agoraEl.addEventListener('click', (ev) => {
  const btn = ev.target.closest('button[data-tab]');
  if (!btn) return;
  activeTab = btn.dataset.tab;
  sessionStorage.setItem('desenv-aba', activeTab);
  render();
});

listaEl.addEventListener('change', (ev) => {
  const input = ev.target.closest('input[data-act="pos"]');
  const card = ev.target.closest('.card');
  if (!input || !card) return;
  const item = items.find((row) => row.id === card.dataset.id);
  if (!item) return;
  void colocarNaPosicao(item.id, activeTab, input.value);
});
listaEl.addEventListener('keydown', (ev) => {
  if (ev.key !== 'Enter') return;
  if (!ev.target.closest('input[data-act="pos"]')) return;
  ev.preventDefault();
  ev.target.blur();
});
listaEl.addEventListener('click', (ev) => {
  if (ev.target.closest('button[data-act="visto-prio"]')) {
    closeAllMais();
    void vistoPrioridade(activeTab);
    return;
  }
  const maisBtn = ev.target.closest('button[data-act="mais"]');
  if (maisBtn) {
    toggleMais(maisBtn);
    return;
  }
  if (!ev.target.closest('.mais-wrap')) closeAllMais();
  const btn = ev.target.closest('button[data-act]');
  const card = ev.target.closest('.card');
  if (!btn || !card) return;
  const item = items.find((row) => row.id === card.dataset.id);
  if (!item) return;
  if (btn.dataset.act === 'edit') openDialog(item);
  if (btn.dataset.act === 'ficha') openFicha(item);
  if (btn.dataset.act === 'ficha-custo') openFichaCusto(refOf(item));
  if (btn.dataset.act === 'syncad') void openSyncad(refOf(item));
  if (btn.dataset.act === 'ok') void avancar(item);
  if (btn.dataset.act === 'abrir') void setTrabalhando(item, true);
  if (btn.dataset.act === 'fechar') void setTrabalhando(item, false);
  if (btn.dataset.act === 'voltar-setor') void voltarSetor(item);
  if (btn.dataset.act === 'voltar') void voltouCliente(item);
  if (btn.dataset.act === 'encerrar') void encerrar(item);
  if (btn.dataset.act === 'apagar') void apagar(item);
  closeAllMais();
});
document.addEventListener('click', (ev) => {
  if (!ev.target.closest('.mais-wrap')) closeAllMais();
});

document.getElementById('ficha-fechar').addEventListener('click', closeFicha);
document.getElementById('ficha-salvar').addEventListener('click', () => {
  void saveFicha();
});
document.getElementById('ficha-imprimir').addEventListener('click', async () => {
  const ok = await saveFicha();
  if (ok) printFicha();
});
document.getElementById('ficha-foto-btn').addEventListener('click', () => {
  document.getElementById('ficha-foto-file').click();
});
document.getElementById('ficha-foto-tirar').addEventListener('click', () => {
  document.getElementById('ficha-foto-cam').click();
});
document.getElementById('ficha-foto-limpar').addEventListener('click', () => {
  showFichaFoto('foto', '');
  document.getElementById('ficha-foto-file').value = '';
  document.getElementById('ficha-foto-cam').value = '';
});
document.getElementById('ficha-foto-file').addEventListener('change', (ev) => {
  void onFichaFoto(ev.target.files?.[0], 'foto');
  ev.target.value = '';
});
document.getElementById('ficha-foto-cam').addEventListener('change', (ev) => {
  void onFichaFoto(ev.target.files?.[0], 'foto');
  ev.target.value = '';
});
bindBackdropClose(dlgFicha, closeFicha);
dlgFicha.addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-foto-act]');
  if (!btn || !dlgFicha.contains(btn)) return;
  const slot = btn.dataset.foto;
  const spec = FICHA_FOTOS[slot];
  if (!spec) return;
  if (btn.dataset.fotoAct === 'pick') document.getElementById(spec.file).click();
  if (btn.dataset.fotoAct === 'cam') document.getElementById(spec.cam).click();
  if (btn.dataset.fotoAct === 'clear') {
    showFichaFoto(slot, '');
    document.getElementById(spec.file).value = '';
    document.getElementById(spec.cam).value = '';
  }
});
['modelo', 'ponto'].forEach((slot) => {
  const spec = FICHA_FOTOS[slot];
  document.getElementById(spec.file).addEventListener('change', (ev) => {
    void onFichaFoto(ev.target.files?.[0], slot);
    ev.target.value = '';
  });
  document.getElementById(spec.cam).addEventListener('change', (ev) => {
    void onFichaFoto(ev.target.files?.[0], slot);
    ev.target.value = '';
  });
});

document.getElementById('syncad-fechar').addEventListener('click', () => {
  dlgSyncad.hidden = true;
});
document.getElementById('syncad-abrir').addEventListener('click', () => {
  void openSyncad(document.getElementById('syncad-codigo').value.trim());
});
document.getElementById('syncad-salvar').addEventListener('click', () => {
  void saveSyncad();
});
document.getElementById('syncad-novo').addEventListener('click', () => {
  void openSyncad('');
});
document.getElementById('syncad-abas').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-syncad-tab]');
  if (!btn) return;
  document.querySelectorAll('#syncad-abas button').forEach((el) => el.classList.toggle('on', el === btn));
  document.getElementById('syncad-pane-produto').hidden = btn.dataset.syncadTab !== 'produto';
  document.getElementById('syncad-pane-processos').hidden = btn.dataset.syncadTab !== 'processos';
  document.getElementById('syncad-pane-ficha').hidden = btn.dataset.syncadTab !== 'ficha';
});
document.getElementById('sc-parte-add').addEventListener('click', () => {
  syncadForm = collectSyncad();
  syncadForm.partes.push({ parte: '', quant: 1 });
  paintSyncadLists();
});
document.getElementById('sc-cor-add').addEventListener('click', () => {
  syncadForm = collectSyncad();
  syncadForm.cores.push({ cor: 0, nome: '', principal: syncadForm.cores.length === 0 });
  paintSyncadLists();
});
bindBackdropClose(dlgSyncad, () => {
  dlgSyncad.hidden = true;
});
dlgSyncad.addEventListener('keydown', onEnterNextField);

boot();
