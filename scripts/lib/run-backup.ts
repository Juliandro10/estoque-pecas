import { existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

import AdmZip from 'adm-zip';

import { copyDirRecursive, copyFileIfExists } from './fs-copy';
import { initFirebaseAdmin, loadProjectId } from './firebase-admin-init';
import { serializeFirestoreValue } from './firestore-serialize';

const FIRESTORE_COLLECTIONS = ['parts', 'withdrawals', 'programs', 'model_cadastro'] as const;

const LOCAL_DATA_FILES = [
  'data/catalogo.json',
  'data/syntech-fios.json',
  'data/m1-knowledge.json',
  'data/yarn-weight-factors.json',
] as const;

export type BackupManifest = {
  version: 1;
  app: 'estoque-pecas';
  created_at: string;
  project_id: string;
  firestore_collections: Record<string, number>;
  local_files: string[];
  zip_file?: string;
};

export type BackupOptions = {
  outDir?: string;
  keep?: number;
  skipZip?: boolean;
  skipFirestore?: boolean;
  skipLocal?: boolean;
  firestoreFromClient?: Record<
    string,
    {
      collection: string;
      exported_at: string;
      count: number;
      documents: { id: string; data: unknown }[];
    }
  >;
  log?: (message: string) => void;
};

export type BackupResult = BackupManifest & {
  zip_path?: string;
  manifest_path: string;
  backup_dir?: string;
};

function timestampFolderName(date = new Date()) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

async function exportCollection(
  db: ReturnType<typeof initFirebaseAdmin>['db'],
  collectionName: string,
  destDir: string,
  log: (message: string) => void
) {
  const snap = await db.collection(collectionName).get();
  const documents = snap.docs.map((doc) => ({
    id: doc.id,
    data: serializeFirestoreValue(doc.data()),
  }));

  const payload = {
    collection: collectionName,
    exported_at: new Date().toISOString(),
    count: documents.length,
    documents,
  };

  writeFileSync(join(destDir, `${collectionName}.json`), JSON.stringify(payload, null, 2), 'utf8');
  log(`${collectionName}: ${documents.length} documento(s)`);
  return documents.length;
}

function copyLocalData(destDir: string, log: (message: string) => void) {
  const copied: string[] = [];
  const localDest = join(destDir, 'local-data');
  mkdirSync(localDest, { recursive: true });

  for (const rel of LOCAL_DATA_FILES) {
    const src = resolve(rel);
    if (!existsSync(src)) {
      log(`Aviso: ${rel} não encontrado — ignorado`);
      continue;
    }
    copyFileIfExists(src, join(localDest, basename(rel)));
    copied.push(rel);
    log(rel);
  }

  const m1VisualSrc = resolve('data/m1-visual');
  if (existsSync(m1VisualSrc)) {
    copyDirRecursive(m1VisualSrc, join(localDest, 'm1-visual'));
    copied.push('data/m1-visual/');
    log('data/m1-visual/');
  }

  const estoqueSrc = resolve('data/estoque.json');
  if (existsSync(estoqueSrc)) {
    copyFileIfExists(estoqueSrc, join(localDest, 'estoque.json'));
    copied.push('data/estoque.json');
    log('data/estoque.json (legado)');
  }

  return copied;
}

function createZip(folderPath: string, zipPath: string) {
  const zip = new AdmZip();
  zip.addLocalFolder(folderPath);
  zip.writeZip(zipPath);
}

function pruneOldBackups(outDir: string, keep: number, log: (message: string) => void) {
  if (!existsSync(outDir)) return;

  const entries = readdirSync(outDir)
    .map((name) => {
      const full = join(outDir, name);
      try {
        const st = statSync(full);
        return { name, full, mtime: st.mtimeMs, isDir: st.isDirectory(), isZip: name.endsWith('.zip') };
      } catch {
        return null;
      }
    })
    .filter((e): e is NonNullable<typeof e> => e !== null)
    .filter((e) => e.isDir || e.isZip)
    .sort((a, b) => b.mtime - a.mtime);

  for (const entry of entries.slice(keep)) {
    if (entry.isDir) rmSync(entry.full, { recursive: true, force: true });
    else rmSync(entry.full, { force: true });
    log(`Removido backup antigo: ${entry.name}`);
  }
}

export async function runBackup(options: BackupOptions = {}): Promise<BackupResult> {
  const outDir = resolve(options.outDir ?? 'backups');
  const keep = Math.max(1, options.keep ?? 30);
  const skipZip = options.skipZip ?? false;
  const skipFirestore = options.skipFirestore ?? false;
  const skipLocal = options.skipLocal ?? false;
  const firestoreFromClient = options.firestoreFromClient;
  const log = options.log ?? (() => {});

  const stamp = timestampFolderName();
  const backupDir = join(outDir, stamp);
  const firestoreDir = join(backupDir, 'firestore');
  mkdirSync(backupDir, { recursive: true });

  let projectId = 'local-only';
  const firestoreCounts: Record<string, number> = {};
  let localFiles: string[] = [];

  if (!skipFirestore) {
    mkdirSync(firestoreDir, { recursive: true });
    if (firestoreFromClient) {
      projectId = loadProjectId();
      for (const [collectionName, payload] of Object.entries(firestoreFromClient)) {
        writeFileSync(join(firestoreDir, `${collectionName}.json`), JSON.stringify(payload, null, 2), 'utf8');
        firestoreCounts[collectionName] = payload.count;
        log(`${collectionName}: ${payload.count} documento(s)`);
      }
    } else {
      const admin = initFirebaseAdmin();
      projectId = admin.projectId;
      for (const col of FIRESTORE_COLLECTIONS) {
        firestoreCounts[col] = await exportCollection(admin.db, col, firestoreDir, log);
      }
    }
  }

  if (!skipLocal) {
    localFiles = copyLocalData(backupDir, log);
  }

  const createdAt = new Date().toISOString();
  const manifest: BackupManifest = {
    version: 1,
    app: 'estoque-pecas',
    created_at: createdAt,
    project_id: projectId,
    firestore_collections: firestoreCounts,
    local_files: localFiles,
  };

  let zipPath: string | undefined;
  if (!skipZip) {
    zipPath = join(outDir, `estoque-pecas-${stamp}.zip`);
    createZip(backupDir, zipPath);
    manifest.zip_file = basename(zipPath);
    rmSync(backupDir, { recursive: true, force: true });
  }

  const manifestPath = skipZip
    ? join(backupDir, 'manifest.json')
    : join(outDir, `estoque-pecas-${stamp}.manifest.json`);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  pruneOldBackups(outDir, keep, log);

  return {
    ...manifest,
    zip_path: zipPath,
    manifest_path: manifestPath,
    backup_dir: skipZip ? backupDir : undefined,
  };
}
