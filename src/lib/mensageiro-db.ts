import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type QuerySnapshot,
  type Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import { loginFromEmail, mensageiroEmail, normalizeMensageiroLogin, senhaParaAuth } from '../../shared/mensageiro-auth';
import { auth, db } from '../firebase';

export const MENSAGEIRO_PESSOAS = 'mensageiro_pessoas';
export const MENSAGEIRO_CONVERSAS = 'mensageiro_conversas';
export const MENSAGEIRO_PRESENCA = 'mensageiro_presenca';
export const PRESENCA_ONLINE_MS = 3 * 60 * 1000;

export type MensageiroPapel = 'estoque' | 'fabrica';

export type MensageiroPessoa = {
  id: string;
  login: string;
  nome: string;
  email: string;
  papel: MensageiroPapel;
  precisa_trocar_senha: boolean;
  visto_em: string;
};

export type MensageiroConversa = {
  id: string;
  membros: string[];
  atualizado_em: string;
  ultimo_texto: string;
  ultimo_de: string;
  lidos: Record<string, string>;
};

export type MensageiroMsg = {
  id: string;
  de: string;
  texto: string;
  ref: string;
  criado_em: string;
};

function tsToIso(value: unknown) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().toISOString();
  }
  return '';
}

export function conversaId(a: string, b: string) {
  return [a, b].sort().join('__');
}

export function outroUid(conversa: MensageiroConversa, meuUid: string) {
  return conversa.membros.find((id) => id !== meuUid) ?? '';
}

/** A outra pessoa já abriu o chat depois desta mensagem. */
export function msgFoiVista(conversa: MensageiroConversa | undefined, msg: Pick<MensageiroMsg, 'de' | 'criado_em'>, meuUid: string) {
  if (!conversa || msg.de !== meuUid || !msg.criado_em) return false;
  const outro = outroUid(conversa, meuUid) || conversa.id.split('__').find((id) => id && id !== meuUid) || '';
  const lido = conversa.lidos[outro] ?? '';
  return Boolean(lido && lido >= msg.criado_em);
}

export function ultimoFoiVisto(conversa: MensageiroConversa, meuUid: string) {
  if (conversa.ultimo_de !== meuUid || !conversa.atualizado_em) return false;
  const outro = outroUid(conversa, meuUid) || conversa.id.split('__').find((id) => id && id !== meuUid) || '';
  const lido = conversa.lidos[outro] ?? '';
  return Boolean(lido && lido >= conversa.atualizado_em);
}

export function conversaNaoLida(conversa: MensageiroConversa, meuUid: string) {
  if (!conversa.ultimo_texto || conversa.ultimo_de === meuUid) return false;
  const lido = conversa.lidos[meuUid] ?? '';
  return !lido || lido < conversa.atualizado_em;
}

export async function garantirMeuPerfil(opts?: { nome?: string; papel?: MensageiroPapel }) {
  const user = auth.currentUser;
  if (!user) return;
  const email = user.email ?? '';
  const login = loginFromEmail(email);
  await setDoc(
    doc(db, MENSAGEIRO_PESSOAS, user.uid),
    {
      login,
      nome: (opts?.nome ?? user.displayName ?? login).trim() || login,
      email,
      papel: opts?.papel ?? 'estoque',
      atualizado_em: serverTimestamp(),
      visto_em: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function criarPessoaRemota(input: { login: string; nome: string; senha: string }) {
  const apiKey = import.meta.env.VITE_FIREBASE_API_KEY as string;
  if (!apiKey) throw new Error('Falta a chave do Firebase neste PC.');
  const login = normalizeMensageiroLogin(input.login);
  if (login.length < 3) throw new Error('O usuário precisa ter pelo menos 3 letras.');
  const senhaAuth = senhaParaAuth(input.senha);
  if (senhaAuth.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres, ou use a padrão 1234.');
  const email = mensageiroEmail(login);
  const nome = input.nome.trim() || login;
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: senhaAuth, returnSecureToken: true }),
    }
  );
  const body = (await res.json()) as { localId?: string; error?: { message?: string } };
  if (!res.ok || !body.localId) {
    const msg = body.error?.message ?? '';
    if (msg.includes('EMAIL_EXISTS')) throw new Error('Esse usuário já existe.');
    if (msg.includes('WEAK_PASSWORD')) throw new Error('Senha fraca demais.');
    if (msg.includes('OPERATION_NOT_ALLOWED')) {
      throw new Error('O Firebase não está aceitando criar usuário por e-mail.');
    }
    throw new Error(msg || 'Não deu para criar o usuário.');
  }
  await setDoc(doc(db, MENSAGEIRO_PESSOAS, body.localId), {
    login,
    nome,
    email,
    papel: 'fabrica',
    precisa_trocar_senha: true,
    atualizado_em: serverTimestamp(),
  });
  return { uid: body.localId, login, nome, email };
}

function pessoaFromData(id: string, data: Record<string, unknown>): MensageiroPessoa {
  return {
    id,
    login: String(data.login ?? ''),
    nome: String(data.nome ?? data.login ?? ''),
    email: String(data.email ?? ''),
    papel: data.papel === 'fabrica' ? 'fabrica' : 'estoque',
    precisa_trocar_senha: data.precisa_trocar_senha === true,
    visto_em: tsToIso(data.visto_em),
  };
}

export function listenMeuPerfil(
  uid: string,
  onData: (row: MensageiroPessoa | null) => void,
  onError?: (err: Error) => void
) {
  return onSnapshot(
    doc(db, MENSAGEIRO_PESSOAS, uid),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(pessoaFromData(snap.id, snap.data() as Record<string, unknown>));
    },
    (err) => onError?.(err)
  );
}

export async function marcarPrecisaTrocarSenha(uid: string) {
  await updateDoc(doc(db, MENSAGEIRO_PESSOAS, uid), {
    precisa_trocar_senha: true,
    atualizado_em: serverTimestamp(),
  });
}

export async function marcarSenhaTrocada(uid: string) {
  await setDoc(
    doc(db, MENSAGEIRO_PESSOAS, uid),
    {
      precisa_trocar_senha: false,
      atualizado_em: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function excluirPessoa(uid: string) {
  await deleteDoc(doc(db, MENSAGEIRO_PESSOAS, uid));
  await deleteDoc(doc(db, MENSAGEIRO_PRESENCA, uid)).catch(() => undefined);
}

export function presencaOnline(vistoIso: string, agora = Date.now()) {
  if (!vistoIso) return false;
  const t = Date.parse(vistoIso);
  return Number.isFinite(t) && agora - t < PRESENCA_ONLINE_MS;
}

export async function baterPresenca(uid: string) {
  if (!uid) return;
  await Promise.allSettled([
    setDoc(doc(db, MENSAGEIRO_PRESENCA, uid), { visto_em: serverTimestamp() }, { merge: true }),
    setDoc(doc(db, MENSAGEIRO_PESSOAS, uid), { visto_em: serverTimestamp() }, { merge: true }),
  ]);
}

export function listenPresenca(onData: (map: Record<string, string>) => void, onError?: (err: Error) => void) {
  return onSnapshot(
    collection(db, MENSAGEIRO_PRESENCA),
    (snap) => {
      const map: Record<string, string> = {};
      for (const row of snap.docs) {
        map[row.id] = tsToIso(row.data().visto_em);
      }
      onData(map);
    },
    (err) => onError?.(err)
  );
}

export function listenPessoas(onData: (rows: MensageiroPessoa[]) => void, onError?: (err: Error) => void) {
  return onSnapshot(
    collection(db, MENSAGEIRO_PESSOAS),
    (snap) => {
      const rows = snap.docs
        .map((row) => pessoaFromData(row.id, row.data() as Record<string, unknown>))
        .sort((a, b) => a.nome.localeCompare(b.nome, 'pt'));
      onData(rows);
    },
    (err) => onError?.(err)
  );
}

export function listenMinhasConversas(
  uid: string,
  onData: (rows: MensageiroConversa[]) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const col = collection(db, MENSAGEIRO_CONVERSAS);
  const mapSnap = (snap: QuerySnapshot) => {
    const rows = snap.docs
      .map((row) => {
        const data = row.data();
        const lidosRaw = data.lidos && typeof data.lidos === 'object' ? data.lidos : {};
        const lidos: Record<string, string> = {};
        for (const [key, value] of Object.entries(lidosRaw as Record<string, unknown>)) {
          lidos[key] = tsToIso(value);
        }
        return {
          id: row.id,
          membros: Array.isArray(data.membros) ? data.membros.map(String) : [],
          atualizado_em: tsToIso(data.atualizado_em),
          ultimo_texto: String(data.ultimo_texto ?? ''),
          ultimo_de: String(data.ultimo_de ?? ''),
          lidos,
        } satisfies MensageiroConversa;
      })
      .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
    onData(rows);
  };

  const indexed = query(col, where('membros', 'array-contains', uid), orderBy('atualizado_em', 'desc'));
  let stop = onSnapshot(indexed, mapSnap, () => {
    const simples = query(col, where('membros', 'array-contains', uid));
    stop = onSnapshot(simples, mapSnap, (err) => onError?.(err));
  });
  return () => stop();
}

export function listenMsgs(conversa: string, onData: (rows: MensageiroMsg[]) => void, onError?: (err: Error) => void) {
  const q = query(collection(db, MENSAGEIRO_CONVERSAS, conversa, 'msgs'), orderBy('criado_em', 'asc'));
  return onSnapshot(
    q,
    (snap) => {
      onData(
        snap.docs.map((row) => {
          const data = row.data();
          return {
            id: row.id,
            de: String(data.de ?? ''),
            texto: String(data.texto ?? ''),
            ref: String(data.ref ?? ''),
            criado_em: tsToIso(data.criado_em),
          };
        })
      );
    },
    (err) => onError?.(err)
  );
}

export async function abrirConversa(meuUid: string, outroUid: string) {
  const id = conversaId(meuUid, outroUid);
  const ref = doc(db, MENSAGEIRO_CONVERSAS, id);
  const snap = await getDoc(ref);
  await setDoc(
    ref,
    {
      membros: [meuUid, outroUid].sort(),
      [`lidos.${meuUid}`]: serverTimestamp(),
      ...(snap.exists() ? {} : { atualizado_em: serverTimestamp(), ultimo_texto: '', ultimo_de: '' }),
    },
    { merge: true }
  );
  return id;
}

export async function marcarLida(conversa: string, uid: string) {
  await setDoc(
    doc(db, MENSAGEIRO_CONVERSAS, conversa),
    { [`lidos.${uid}`]: serverTimestamp() },
    { merge: true }
  );
  void baterPresenca(uid).catch(() => undefined);
}

export async function enviarMsg(input: { conversa: string; de: string; texto: string; ref?: string }) {
  const texto = input.texto.trim();
  if (!texto) throw new Error('Escreva a mensagem.');
  if (texto.length > 1800) throw new Error('Mensagem grande demais.');
  const ref = String(input.ref ?? '').trim();
  const membros = input.conversa.split('__').filter(Boolean);
  await addDoc(collection(db, MENSAGEIRO_CONVERSAS, input.conversa, 'msgs'), {
    de: input.de,
    texto,
    ref,
    criado_em: serverTimestamp(),
  });
  void baterPresenca(input.de).catch(() => undefined);
  await setDoc(
    doc(db, MENSAGEIRO_CONVERSAS, input.conversa),
    {
      ...(membros.length === 2 ? { membros: membros.sort() } : {}),
      atualizado_em: serverTimestamp(),
      ultimo_texto: texto.slice(0, 180),
      ultimo_de: input.de,
      [`lidos.${input.de}`]: serverTimestamp(),
    },
    { merge: true }
  );
}

export async function listarRefsDesenv() {
  const snap = await getDocs(query(collection(db, 'desenvolvimentos'), limit(400)));
  const refs = new Set<string>();
  for (const row of snap.docs) {
    const data = row.data();
    const ref = String(data.syntech_codigo ?? data.referencia ?? '').trim();
    if (ref) refs.add(ref);
  }
  return [...refs].sort((a, b) => a.localeCompare(b, 'pt', { numeric: true }));
}
