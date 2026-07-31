import { runBackup, type BackupResult } from '../scripts/lib/run-backup';

let backupRunning = false;

export type BackupRequest = {
  localOnly?: boolean;
  firestoreOnly?: boolean;
  firestore?: Record<
    string,
    {
      collection: string;
      exported_at: string;
      count: number;
      documents: { id: string; data: unknown }[];
    }
  >;
};

export async function handleBackupRequest(body: BackupRequest = {}): Promise<BackupResult> {
  if (backupRunning) {
    throw new Error('Já existe um backup em andamento. Aguarde a conclusão.');
  }

  backupRunning = true;
  try {
    return await runBackup({
      skipFirestore: body.localOnly === true,
      skipLocal: body.firestoreOnly === true,
      firestoreFromClient: body.firestore,
      log: (message) => console.log(`[backup] ${message}`),
    });
  } finally {
    backupRunning = false;
  }
}
