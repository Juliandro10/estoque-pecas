const STORAGE_KEY = 'mensageiro-avisos';

export function avisosPermitidos() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}

export function avisosBloqueados() {
  return typeof Notification !== 'undefined' && Notification.permission === 'denied';
}

export async function pedirAvisos() {
  if (typeof Notification === 'undefined') {
    throw new Error('Este navegador não mostra aviso na tela.');
  }
  const result = await Notification.requestPermission();
  return result === 'granted';
}

export function mostrarAvisoMensagem(input: { titulo: string; corpo: string; tag: string }) {
  if (!avisosPermitidos()) return;
  try {
    const n = new Notification(input.titulo, {
      body: input.corpo,
      tag: input.tag,
      silent: false,
    });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* ignore */
  }
  try {
    navigator.vibrate?.([80, 40, 80]);
  } catch {
    /* ignore */
  }
}

export function atualizarTituloNaoLidas(n: number) {
  const base = 'Estoque de Peças';
  document.title = n > 0 ? `(${n}) ${base}` : base;
}

function chaveVista(id: string, quando: string) {
  return `${id}:${quando}`;
}

export function jaAvisou(id: string, quando: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    return seen.includes(chaveVista(id, quando));
  } catch {
    return false;
  }
}

export function marcarAvisou(id: string, quando: string) {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    const seen = raw ? (JSON.parse(raw) as string[]) : [];
    seen.push(chaveVista(id, quando));
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(seen.slice(-80)));
  } catch {
    /* ignore */
  }
}
