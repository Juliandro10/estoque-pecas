import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { DESENV_BOARD_EMAIL } from '../shared/desenv-setor-auth.ts';
import { loadFirebaseWebConfig } from '../painel-tecelagem/publish-firebase.ts';

const authFile = path.resolve('painel-desenvolvimentos/.setor-auth.json');

function saveAuth(auth: { email: string; password: string }) {
  fs.writeFileSync(authFile, JSON.stringify(auth, null, 2) + '\n');
}

function loadOrCreateAuth() {
  try {
    const current = JSON.parse(fs.readFileSync(authFile, 'utf8')) as { email?: string; password?: string };
    if (current.email && current.password) {
      return { email: current.email, password: current.password };
    }
  } catch {
    // cria novo
  }
  const created = {
    email: process.env.DESENV_FIREBASE_EMAIL ?? DESENV_BOARD_EMAIL,
    password: process.env.DESENV_FIREBASE_PASSWORD || crypto.randomBytes(12).toString('base64url'),
  };
  saveAuth(created);
  return created;
}

async function identityPost(apiKey: string, action: string, body: Record<string, unknown>) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
  const json = (await res.json()) as { idToken?: string; error?: { message?: string } };
  return { ok: res.ok, json };
}

async function main() {
  const { apiKey } = loadFirebaseWebConfig();
  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY no .env');
  const auth = loadOrCreateAuth();
  const wantedPassword = process.env.DESENV_FIREBASE_PASSWORD;

  const signUp = await identityPost(apiKey, 'signUp', { ...auth, returnSecureToken: true });
  if (signUp.ok && signUp.json.idToken) {
    if (wantedPassword && wantedPassword !== auth.password) {
      const updated = await identityPost(apiKey, 'update', {
        idToken: signUp.json.idToken,
        password: wantedPassword,
        returnSecureToken: true,
      });
      if (!updated.ok) {
        throw new Error(updated.json.error?.message || 'Nao foi possivel trocar a senha.');
      }
      saveAuth({ email: auth.email, password: wantedPassword });
      console.log(`Conta criada: ${auth.email}`);
      console.log(`Senha: ${wantedPassword}`);
      return;
    }
    console.log(`Conta criada: ${auth.email}`);
    console.log(`Senha: ${auth.password}`);
    return;
  }

  const message = signUp.json.error?.message ?? '';
  if (message.includes('EMAIL_EXISTS')) {
    const signIn = await identityPost(apiKey, 'signInWithPassword', { ...auth, returnSecureToken: true });
    if (!signIn.ok || !signIn.json.idToken) {
      throw new Error(
        'A conta ja existe, mas a senha em painel-desenvolvimentos/.setor-auth.json nao confere.'
      );
    }
    if (wantedPassword && wantedPassword !== auth.password) {
      const updated = await identityPost(apiKey, 'update', {
        idToken: signIn.json.idToken,
        password: wantedPassword,
        returnSecureToken: true,
      });
      if (!updated.ok) {
        throw new Error(updated.json.error?.message || 'Nao foi possivel trocar a senha.');
      }
      saveAuth({ email: auth.email, password: wantedPassword });
      console.log(`Conta atualizada: ${auth.email}`);
      console.log(`Senha: ${wantedPassword}`);
      return;
    }
    console.log(`Conta ja existia: ${auth.email}`);
    console.log(`Senha: ${auth.password}`);
    return;
  }

  throw new Error(message || 'Nao foi possivel criar a conta de Desenvolvimentos.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
