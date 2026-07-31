import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import admin from 'firebase-admin';

export function loadEnvFile() {
  try {
    const raw = readFileSync(resolve('.env'), 'utf8');
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

export function loadProjectId() {
  loadEnvFile();
  if (process.env.VITE_FIREBASE_PROJECT_ID) return process.env.VITE_FIREBASE_PROJECT_ID;
  try {
    const rc = JSON.parse(readFileSync(resolve('.firebaserc'), 'utf8')) as {
      projects?: { default?: string };
    };
    if (rc.projects?.default) return rc.projects.default;
  } catch {
    // ignore
  }
  throw new Error('Defina VITE_FIREBASE_PROJECT_ID em .env ou configure .firebaserc');
}

export function findServiceAccountPath() {
  loadEnvFile();
  const fromEnv = process.env.GOOGLE_APPLICATION_CREDENTIALS ?? process.env.FIREBASE_SERVICE_ACCOUNT;
  if (fromEnv) {
    const resolved = resolve(fromEnv);
    try {
      readFileSync(resolved);
      return resolved;
    } catch {
      console.warn(`Arquivo não encontrado: ${resolved}`);
    }
  }

  const candidates = [
    resolve('service-account.json'),
    ...readdirSync('.').filter((f) => f.includes('firebase-adminsdk') && f.endsWith('.json')).map((f) => resolve(f)),
  ];

  for (const path of candidates) {
    try {
      readFileSync(path);
      return path;
    } catch {
      // try next
    }
  }

  throw new Error(
    'Coloque o JSON da service account na pasta do projeto (ou defina GOOGLE_APPLICATION_CREDENTIALS). No painel web, use o botão Fazer backup — ele exporta o Firestore com seu login, sem precisar desse arquivo.'
  );
}

export function initFirebaseAdmin(projectId?: string) {
  const id = projectId ?? loadProjectId();
  const credPath = findServiceAccountPath();
  console.log(`Credencial: ${credPath}`);
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: id,
    });
  }
  return { projectId: id, db: admin.firestore() };
}
