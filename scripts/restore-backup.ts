import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import AdmZip from 'adm-zip';

import { initFirebaseAdmin } from './lib/firebase-admin-init';
import { deserializeFirestoreValue } from './lib/firestore-serialize';

type CollectionExport = {
  collection: string;
  documents: { id: string; data: Record<string, unknown> }[];
};

function parseArgs() {
  const args = process.argv.slice(2);
  let source = '';
  let dryRun = false;
  let collections: string[] | null = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--collections' && args[i + 1]) {
      collections = args[++i].split(',').map((c) => c.trim()).filter(Boolean);
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: npm run restore:backup -- <arquivo.zip ou pasta> [--dry-run] [--collections parts,withdrawals]

Restaura coleções do Firestore a partir de um backup gerado por npm run backup.
Não restaura arquivos locais (data/) — copie manualmente de local-data/ se necessário.`);
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      source = arg;
    }
  }

  if (!source) {
    throw new Error('Informe o caminho do backup (.zip ou pasta com firestore/).');
  }

  return { source: resolve(source), dryRun, collections };
}

function extractZipIfNeeded(source: string): { workDir: string; cleanup: () => void } {
  if (!source.endsWith('.zip')) {
    return { workDir: source, cleanup: () => {} };
  }

  const zip = new AdmZip(source);
  const tmpDir = join(resolve('backups'), `.restore-tmp-${Date.now()}`);
  zip.extractAllTo(tmpDir, true);
  return {
    workDir: tmpDir,
    cleanup: () => {
      try {
        rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        // ignore
      }
    },
  };
}

function findFirestoreDir(workDir: string) {
  const direct = join(workDir, 'firestore');
  if (existsSync(direct)) return direct;

  const children = readdirSync(workDir);
  for (const child of children) {
    const candidate = join(workDir, child, 'firestore');
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(`Pasta firestore/ não encontrada em ${workDir}`);
}

async function restoreCollection(collectionName: string, filePath: string, dryRun: boolean) {
  const raw = JSON.parse(readFileSync(filePath, 'utf8')) as CollectionExport;
  const docs = raw.documents ?? [];
  console.log(`  ${collectionName}: ${docs.length} documento(s)${dryRun ? ' (dry-run)' : ''}`);

  if (dryRun) return;

  const { db } = initFirebaseAdmin();
  const batchSize = 400;
  for (let i = 0; i < docs.length; i += batchSize) {
    const chunk = docs.slice(i, i + batchSize);
    const batch = db.batch();
    for (const doc of chunk) {
      const data = deserializeFirestoreValue(doc.data) as Record<string, unknown>;
      batch.set(db.collection(collectionName).doc(doc.id), data, { merge: false });
    }
    await batch.commit();
  }
}

async function main() {
  const { source, dryRun, collections } = parseArgs();
  if (!existsSync(source)) throw new Error(`Backup não encontrado: ${source}`);

  const { workDir, cleanup } = extractZipIfNeeded(source);
  try {
    const firestoreDir = findFirestoreDir(workDir);
    const files = readdirSync(firestoreDir).filter((f) => f.endsWith('.json'));
    const selected = collections
      ? files.filter((f) => collections.includes(f.replace(/\.json$/, '')))
      : files;

    if (selected.length === 0) {
      throw new Error('Nenhuma coleção encontrada para restaurar.');
    }

    console.log(`Restaurando de: ${source}`);
    if (dryRun) console.log('Modo dry-run — nada será gravado no Firestore.');

    for (const file of selected) {
      const collectionName = file.replace(/\.json$/, '');
      await restoreCollection(collectionName, join(firestoreDir, file), dryRun);
    }

    console.log('Restauração concluída.');
  } finally {
    cleanup();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
