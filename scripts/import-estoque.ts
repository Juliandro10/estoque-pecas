import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import admin from 'firebase-admin';

const DEFAULT_ESTOQUE = resolve('data/estoque.json');

type LocalPart = {
  id: number;
  code: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit: string;
};

type LocalMovement = {
  type: string;
  part_id: number;
  quantity: number;
  previous_qty: number;
  new_qty: number;
  shift: string | null;
  withdrawn_by: string | null;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
};

type EstoqueFile = {
  parts: LocalPart[];
  movements: LocalMovement[];
};

function loadEnvFile() {
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
    // .env opcional — projectId pode vir do argumento ou .firebaserc
  }
}

function loadProjectId() {
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

function findServiceAccountPath() {
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
    'Coloque o JSON da service account na pasta do projeto (ou defina GOOGLE_APPLICATION_CREDENTIALS).'
  );
}

function initAdmin(projectId: string) {
  const credPath = findServiceAccountPath();
  console.log(`Credencial: ${credPath}`);
  const serviceAccount = JSON.parse(readFileSync(credPath, 'utf8'));
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId,
  });
}

async function importParts(db: admin.firestore.Firestore, parts: LocalPart[]) {
  const batch = db.batch();
  for (const part of parts) {
    const ref = db.collection('parts').doc(part.code);
    batch.set(
      ref,
      {
        code: part.code,
        name: part.name,
        quantity: part.quantity,
        min_quantity: part.min_quantity,
        unit: part.unit,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }
  await batch.commit();
  console.log(`Peças importadas: ${parts.length}`);
  for (const part of parts) {
    console.log(`  ${part.code.padEnd(10)} → ${part.quantity} ${part.unit}`);
  }
}

async function importWithdrawals(
  db: admin.firestore.Firestore,
  parts: LocalPart[],
  movements: LocalMovement[]
) {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const withdrawals = movements.filter((m) => m.type === 'withdrawal');
  if (withdrawals.length === 0) {
    console.log('Retiradas: nenhuma no arquivo (só ajustes locais).');
    return;
  }

  let count = 0;
  for (const m of withdrawals) {
    const part = byId.get(m.part_id);
    if (!part) {
      console.warn(`  Ignorada retirada part_id=${m.part_id} — peça não encontrada`);
      continue;
    }
    await db.collection('withdrawals').add({
      part_id: part.code,
      part_code: part.code,
      part_name: part.name,
      type: 'withdrawal',
      quantity: m.quantity,
      previous_qty: m.previous_qty,
      new_qty: m.new_qty,
      shift: m.shift,
      withdrawn_by: m.withdrawn_by,
      requested_by: m.requested_by,
      notes: m.notes,
      created_at: admin.firestore.Timestamp.fromDate(new Date(m.created_at)),
    });
    count++;
  }
  console.log(`Retiradas importadas: ${count}`);
}

async function main() {
  const estoquePath = resolve(process.argv[2] ?? DEFAULT_ESTOQUE);
  const projectId = loadProjectId();
  initAdmin(projectId);

  console.log(`Projeto: ${projectId}`);
  console.log(`Arquivo: ${estoquePath}`);

  const raw = JSON.parse(readFileSync(estoquePath, 'utf8')) as EstoqueFile;
  const db = admin.firestore();

  await importParts(db, raw.parts);
  await importWithdrawals(db, raw.parts, raw.movements);

  console.log('Importação concluída.');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
