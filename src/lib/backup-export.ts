import { collection, getDocs, Timestamp } from 'firebase/firestore';

import { db } from '../firebase';

const FIRESTORE_COLLECTIONS = ['parts', 'withdrawals', 'programs', 'model_cadastro', 'program_clients'] as const;

export type ClientFirestoreBackup = Record<
  (typeof FIRESTORE_COLLECTIONS)[number],
  {
    collection: string;
    exported_at: string;
    count: number;
    documents: { id: string; data: unknown }[];
  }
>;

function serializeFirestoreValue(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Timestamp) {
    return { __type: 'timestamp', value: value.toDate().toISOString() };
  }
  if (Array.isArray(value)) return value.map(serializeFirestoreValue);
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        serializeFirestoreValue(entry),
      ])
    );
  }
  return value;
}

export async function exportFirestoreForBackup(): Promise<ClientFirestoreBackup> {
  const exportedAt = new Date().toISOString();
  const result = {} as ClientFirestoreBackup;

  for (const collectionName of FIRESTORE_COLLECTIONS) {
    const snap = await getDocs(collection(db, collectionName));
    result[collectionName] = {
      collection: collectionName,
      exported_at: exportedAt,
      count: snap.docs.length,
      documents: snap.docs.map((docSnap) => ({
        id: docSnap.id,
        data: serializeFirestoreValue(docSnap.data()),
      })),
    };
  }

  return result;
}
