import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import { PAINEL_PUBLISH_EMAIL } from '../painel-tecelagem/public-board.ts';
import { loadFirebaseWebConfig } from '../painel-tecelagem/publish-firebase.ts';

const authFile = path.resolve('painel-tecelagem/.publish-auth.json');

function loadOrCreateAuth() {
  try {
    const current = JSON.parse(fs.readFileSync(authFile, 'utf8')) as { email?: string; password?: string };
    if (current.email && current.password) return current;
  } catch {
    // cria novo
  }
  const created = {
    email: process.env.PAINEL_FIREBASE_EMAIL ?? PAINEL_PUBLISH_EMAIL,
    password: crypto.randomBytes(18).toString('base64url'),
  };
  fs.writeFileSync(authFile, JSON.stringify(created, null, 2) + '\n');
  return created;
}

async function main() {
  const { apiKey } = loadFirebaseWebConfig();
  if (!apiKey) throw new Error('Falta VITE_FIREBASE_API_KEY no .env');
  const auth = loadOrCreateAuth();

  const signUp = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...auth, returnSecureToken: true }),
    }
  );
  const signUpBody = (await signUp.json()) as { idToken?: string; error?: { message?: string } };
  if (signUp.ok && signUpBody.idToken) {
    console.log('Conta do painel criada no Firebase Auth.');
    return;
  }

  const message = signUpBody.error?.message ?? '';
  if (message.includes('EMAIL_EXISTS')) {
    const signIn = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...auth, returnSecureToken: true }),
      }
    );
    if (!signIn.ok) {
      throw new Error(
        'A conta do painel ja existe, mas a senha em painel-tecelagem/.publish-auth.json nao confere. Ajuste a senha ou apague o arquivo e crie a conta de novo no Firebase.'
      );
    }
    console.log('Conta do painel ja existia e a senha confere.');
    return;
  }

  throw new Error(message || 'Nao foi possivel criar a conta do painel no Firebase Auth.');
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
