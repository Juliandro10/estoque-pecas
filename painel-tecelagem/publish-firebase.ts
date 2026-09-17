import fs from 'node:fs';
import path from 'node:path';

import {
  PAINEL_FIRESTORE_COLLECTION,
  PAINEL_FIRESTORE_DOCUMENT,
  PAINEL_PUBLISH_EMAIL,
  type PainelPublico,
} from './public-board.ts';

type PublishAuth = { email: string; password: string };

function readJson(file: string) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) as Record<string, string>;
  } catch {
    return null;
  }
}

function loadDotEnv(root: string) {
  try {
    const raw = fs.readFileSync(path.join(root, '.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env opcional
  }
}

function candidateRoots() {
  const roots = [process.env.PAINEL_ROOT, process.env.DESENV_ROOT, process.cwd()];
  return [...new Set(roots.filter((value): value is string => Boolean(value)))];
}

export function loadFirebaseWebConfig() {
  for (const root of candidateRoots()) {
    loadDotEnv(root);
    const file = readJson(path.join(root, 'firebase-web.json'));
    if (file?.apiKey && file?.projectId) {
      return { projectId: file.projectId, apiKey: file.apiKey };
    }
  }
  const projectId = process.env.VITE_FIREBASE_PROJECT_ID ?? 'controle-tricot-e-cia';
  const apiKey = process.env.VITE_FIREBASE_API_KEY ?? '';
  return { projectId, apiKey };
}

function loadPublishAuth(): PublishAuth | null {
  for (const root of candidateRoots()) loadDotEnv(root);
  const email = process.env.PAINEL_FIREBASE_EMAIL ?? PAINEL_PUBLISH_EMAIL;
  const password = process.env.PAINEL_FIREBASE_PASSWORD;
  if (email && password) return { email, password };

  for (const root of candidateRoots()) {
    for (const name of ['painel-publish.json', path.join('painel-tecelagem', '.publish-auth.json')]) {
      const data = readJson(path.join(root, name));
      if (data?.email && data?.password) return { email: data.email, password: data.password };
    }
  }
  return null;
}

async function signIn(apiKey: string, auth: PublishAuth) {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...auth, returnSecureToken: true }),
    }
  );
  const body = (await res.json()) as { idToken?: string; error?: { message?: string } };
  if (!res.ok || !body.idToken) {
    throw new Error(body.error?.message ?? 'Falha ao autenticar o envio do painel.');
  }
  return body.idToken;
}

let painelSession: { projectId: string; apiKey: string; idToken: string; exp: number } | null = null;
let painelQuotaUntil = 0;

export async function getPainelIdToken() {
  const { projectId, apiKey } = loadFirebaseWebConfig();
  const auth = loadPublishAuth();
  if (!apiKey || !auth) return null;
  if (painelSession && Date.now() < painelSession.exp) return painelSession;
  if (Date.now() < painelQuotaUntil) return null;
  try {
    const idToken = await signIn(apiKey, auth);
    painelSession = { projectId, apiKey, idToken, exp: Date.now() + 50 * 60 * 1000 };
    return painelSession;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/QUOTA/i.test(msg)) {
      painelQuotaUntil = Date.now() + 30 * 60 * 1000;
      console.warn('Nuvem: cota de login estourada, pausa 30 min.');
      return null;
    }
    throw err;
  }
}

export async function patchFirestoreJson(
  collection: string,
  documentId: string,
  json: unknown,
  updatedAt = new Date().toISOString()
) {
  const session = await getPainelIdToken();
  if (!session) {
    console.warn('Nuvem: sem login do painel.');
    return false;
  }
  const text = JSON.stringify(json);
  const url = `https://firestore.googleapis.com/v1/projects/${session.projectId}/databases/(default)/documents/${collection}/${documentId}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        json: { stringValue: text },
        updated_at: { stringValue: updatedAt },
      },
    }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore ${res.status}: ${errText.slice(0, 240)}`);
  }
  return true;
}

export async function publishPainelToFirebase(board: PainelPublico) {
  const ok = await patchFirestoreJson(
    PAINEL_FIRESTORE_COLLECTION,
    PAINEL_FIRESTORE_DOCUMENT,
    board,
    board.updated_at
  );
  if (ok) console.log('Nuvem ok', board.updated_at);
}
