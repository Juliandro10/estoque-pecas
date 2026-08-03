import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

import { db } from '../firebase';
import type { ProgrammingClient } from '../types-programming';
import { DEFAULT_PROGRAM_CLIENT_ID, PROGRAM_VALUE } from '../types-programming';

const clientsCol = collection(db, 'program_clients');

function mapClient(id: string, data: Record<string, unknown>): ProgrammingClient {
  return {
    id,
    name: String(data.name ?? id),
    default_value: Number(data.default_value ?? PROGRAM_VALUE),
    is_internal: data.is_internal === true,
  };
}

function sortClients(clients: ProgrammingClient[]) {
  return [...clients].sort((a, b) => {
    if (a.id === DEFAULT_PROGRAM_CLIENT_ID) return -1;
    if (b.id === DEFAULT_PROGRAM_CLIENT_ID) return 1;
    return a.name.localeCompare(b.name, 'pt-BR');
  });
}

function slugifyClientName(name: string) {
  const slug = name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'cliente';
}

export const programmingClientsDb = {
  ensureDefaults: async () => {
    const ref = doc(clientsCol, DEFAULT_PROGRAM_CLIENT_ID);
    const snap = await getDoc(ref);
    if (snap.exists()) return mapClient(snap.id, snap.data());

    const client = {
      name: 'Tricot & Cia',
      default_value: PROGRAM_VALUE,
      is_internal: true,
      created_at: serverTimestamp(),
    };
    await setDoc(ref, client);
    return mapClient(DEFAULT_PROGRAM_CLIENT_ID, client);
  },

  list: async () => {
    await programmingClientsDb.ensureDefaults();
    const snap = await getDocs(clientsCol);
    return sortClients(snap.docs.map((entry) => mapClient(entry.id, entry.data())));
  },

  get: async (id: string) => {
    const snap = await getDoc(doc(clientsCol, id));
    if (!snap.exists()) return null;
    return mapClient(snap.id, snap.data());
  },

  add: async (name: string, defaultValue: number) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Informe o nome do cliente.');

    const existing = await programmingClientsDb.list();
    const baseId = slugifyClientName(trimmed);
    let id = baseId;
    let suffix = 2;
    while (existing.some((client) => client.id === id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
    }

    await setDoc(doc(clientsCol, id), {
      name: trimmed,
      default_value: defaultValue,
      is_internal: false,
      created_at: serverTimestamp(),
    });
    return mapClient(id, { name: trimmed, default_value: defaultValue, is_internal: false });
  },

  update: async (id: string, patch: { name?: string; default_value?: number }) => {
    const current = await programmingClientsDb.get(id);
    if (!current) throw new Error('Cliente não encontrado.');

    const nextName = patch.name?.trim() || current.name;
    const nextValue =
      patch.default_value === undefined || Number.isNaN(patch.default_value)
        ? current.default_value
        : Math.max(0, patch.default_value);

    await updateDoc(doc(clientsCol, id), {
      name: nextName,
      default_value: nextValue,
    });

    return mapClient(id, {
      ...current,
      name: nextName,
      default_value: nextValue,
    });
  },

  remove: async (id: string) => {
    if (id === DEFAULT_PROGRAM_CLIENT_ID) {
      throw new Error('O cliente interno Tricot & Cia não pode ser removido.');
    }
    await deleteDoc(doc(clientsCol, id));
  },
};
