import fs from 'node:fs';
import path from 'node:path';

import { loadFirebaseWebConfig } from '../painel-tecelagem/publish-firebase.ts';
import { DESENV_BOARD_EMAIL } from '../shared/desenv-setor-auth.ts';
import { listSyntechProdutoCatalog } from './syntech-desenv.ts';

export const SYNTECH_CATALOG_COLLECTION = 'syntech_catalog';
export const SYNTECH_CATALOG_DOCUMENT = 'produtos';

const INTERVAL_MS = 10 * 60 * 1000;

function readJson(file: string) {
  try {
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
    return JSON.parse(raw) as { email?: string; password?: string };
  } catch {
    return null;
  }
}

function loadDesenvAuth() {
  const email = process.env.DESENV_FIREBASE_EMAIL ?? DESENV_BOARD_EMAIL;
  const password = process.env.DESENV_FIREBASE_PASSWORD;
  if (email && password) return { email, password };
  const roots = [process.cwd(), path.resolve(process.cwd(), 'painel-desenvolvimentos')];
  for (const root of roots) {
    const data = readJson(path.join(root, '.setor-auth.json'))
      ?? readJson(path.join(root, 'painel-desenvolvimentos', '.setor-auth.json'));
    if (data?.email && data?.password) return { email: data.email, password: data.password };
  }
  return null;
}

async function signIn(apiKey: string, auth: { email: string; password: string }) {
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
    throw new Error(body.error?.message ?? 'Falha ao autenticar o envio do cadastro Syntech.');
  }
  return body.idToken;
}

export async function publishSyntechCatalog() {
  const { projectId, apiKey } = loadFirebaseWebConfig();
  const auth = loadDesenvAuth();
  if (!apiKey || !auth) {
    console.warn('Cadastro Syntech: sem login da conta de Desenvolvimentos. Celular nao puxa nome do modelo.');
    return;
  }
  const catalog = await listSyntechProdutoCatalog();
  const json = JSON.stringify(catalog);
  if (json.length < 3 || json.length >= 900000) {
    throw new Error(`Cadastro Syntech fora do tamanho (${json.length} bytes).`);
  }
  const idToken = await signIn(apiKey, auth);
  const updatedAt = new Date().toISOString();
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${SYNTECH_CATALOG_COLLECTION}/${SYNTECH_CATALOG_DOCUMENT}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        json: { stringValue: json },
        updated_at: { stringValue: updatedAt },
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore ${res.status}: ${text.slice(0, 240)}`);
  }
  console.log(`Cadastro Syntech na nuvem: ${Object.keys(catalog).length} produtos.`);
}

export function startSyntechCatalogPublish() {
  const run = () => {
    void publishSyntechCatalog().catch((err) => {
      console.warn('Cadastro Syntech na nuvem falhou:', err instanceof Error ? err.message : err);
    });
  };
  run();
  setInterval(run, INTERVAL_MS);
}
