import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { senhaParaAuth } from '../shared/mensageiro-auth';
import { loadProjectId } from '../scripts/lib/firebase-admin-init';

const FIREBASE_TOOLS_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com';
const FIREBASE_TOOLS_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi';

type CliTokens = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
};

function readCliTokens(): CliTokens {
  const file = join(homedir(), '.config', 'configstore', 'firebase-tools.json');
  try {
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { tokens?: CliTokens };
    return raw.tokens ?? {};
  } catch {
    throw new Error('Neste PC falta o login do Firebase. Abra um terminal na pasta do Estoque e rode: npx firebase login');
  }
}

async function getCliAccessToken() {
  const tokens = readCliTokens();
  const expiresAt = Number(tokens.expires_at ?? 0);
  if (tokens.access_token && expiresAt > Date.now() + 60_000) {
    return tokens.access_token;
  }
  if (!tokens.refresh_token) {
    throw new Error('Neste PC falta o login do Firebase. Rode: npx firebase login');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
      client_id: FIREBASE_TOOLS_CLIENT_ID,
      client_secret: FIREBASE_TOOLS_CLIENT_SECRET,
    }),
  });
  const body = (await res.json()) as { access_token?: string; error?: string };
  if (!res.ok || !body.access_token) {
    throw new Error('O login do Firebase neste PC expirou. Rode: npx firebase login');
  }
  return body.access_token;
}

async function identityToolkit(path: string, payload: Record<string, string>) {
  const projectId = loadProjectId();
  const token = await getCliAccessToken();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!res.ok) {
    const msg = body.error?.message ?? '';
    if (msg.includes('USER_NOT_FOUND') || msg.includes('CONFIGURATION_NOT_FOUND')) {
      throw new Error('Esse login não existe mais no Firebase.');
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error('Este login do Firebase neste PC não pode gerenciar usuários. Rode: npx firebase login');
    }
    throw new Error(msg || 'Não deu para alterar este login no Firebase.');
  }
}

export async function definirSenhaFirebase(uid: string, senha: string) {
  const id = String(uid ?? '').trim();
  const pass = senhaParaAuth(senha);
  if (!id) throw new Error('Falta o usuário.');
  if (pass.length < 6) throw new Error('A senha precisa ter pelo menos 6 caracteres, ou use a padrão 1234.');
  await identityToolkit('accounts:update', { localId: id, password: pass });
}

export async function excluirLoginFirebase(uid: string) {
  const id = String(uid ?? '').trim();
  if (!id) throw new Error('Falta o usuário.');
  try {
    await identityToolkit('accounts:delete', { localId: id });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (!msg.includes('não existe mais')) throw err;
  }
}
