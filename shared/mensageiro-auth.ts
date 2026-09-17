import { resolveDesenvLogin } from './desenv-setor-auth';

export const MENSAGEIRO_EMAIL_DOMAIN = 'mensageiro.controle-tricot-e-cia.web.app';

/** Primeira senha de todo login da fábrica. */
export const SENHA_PADRAO = '1234';

/** O Firebase não aceita senha com menos de 6 letras; 1234 continua valendo na tela. */
export function senhaParaAuth(senha: string) {
  const s = senha.trim();
  if (s === SENHA_PADRAO) return `${SENHA_PADRAO}xx`;
  return s;
}

export function normalizeMensageiroLogin(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '');
}

export function mensageiroEmail(login: string) {
  return `${normalizeMensageiroLogin(login)}@${MENSAGEIRO_EMAIL_DOMAIN}`;
}

export function isFabricaChatEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase().endsWith(`@${MENSAGEIRO_EMAIL_DOMAIN}`);
}

export function loginFromEmail(email: string | null | undefined) {
  const raw = (email ?? '').trim().toLowerCase();
  const at = raw.indexOf('@');
  return at > 0 ? raw.slice(0, at) : raw;
}

/** Usuário na tela (maria) vira e-mail do Firebase, sem misturar com desenvolvimento. */
export function resolveAppLogin(value: string) {
  const trimmed = value.trim();
  if (trimmed.includes('@')) return resolveDesenvLogin(trimmed);
  const desenv = resolveDesenvLogin(trimmed);
  if (desenv.includes('@')) return desenv;
  return mensageiroEmail(trimmed);
}
