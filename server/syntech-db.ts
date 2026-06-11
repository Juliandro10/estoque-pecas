import './setup-firebird-client';

import Firebird from 'node-firebird';

export const SYNTech_FB_CONFIG = {
  host: process.env.SYNTECH_FB_HOST ?? '192.168.1.69',
  port: Number(process.env.SYNTECH_FB_PORT ?? 3050),
  database: process.env.SYNTECH_FB_DATABASE ?? 'C:\\Textil\\Empresas\\FABRICA.MDB',
  user: process.env.SYNTECH_FB_USER ?? 'SYSDBA',
  password: process.env.SYNTECH_FB_PASSWORD ?? 'masterkey',
  lowercase_keys: false,
  pageSize: 4096,
};

export type FirebirdDb = Firebird.Database;
export type SyntechTx = Firebird.Transaction;

export function attachSyntechDb(): Promise<FirebirdDb> {
  return new Promise((resolve, reject) => {
    Firebird.attach(SYNTech_FB_CONFIG, (err, db) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

export function detachDb(db: FirebirdDb): Promise<void> {
  return new Promise((resolve, reject) => {
    db.detach((err) => (err ? reject(err) : resolve()));
  });
}

export function queryDb<T = Record<string, unknown>>(
  db: FirebirdDb,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.query(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows ?? []) as T[]);
    });
  });
}

export function runInTransaction<T>(
  db: FirebirdDb,
  fn: (tx: SyntechTx) => Promise<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    db.transaction(Firebird.ISOLATION_READ_COMMITTED, (err, tx) => {
      if (err || !tx) {
        reject(err ?? new Error('Transação indisponível'));
        return;
      }

      fn(tx)
        .then((result) => {
          tx.commit((commitErr) => {
            if (commitErr) reject(commitErr);
            else resolve(result);
          });
        })
        .catch((runErr) => {
          tx.rollback(() => reject(runErr));
        });
    });
  });
}

export function queryTx<T = Record<string, unknown>>(
  tx: SyntechTx,
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  return new Promise((resolve, reject) => {
    tx.query(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve((rows ?? []) as T[]);
    });
  });
}

export function parseWeightKg(raw: string) {
  const value = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(value) ? value : 0;
}

/** MM:SS ou HH:MM:SS → texto Syntech `MM :SS` (espaço antes dos dois pontos). */
export function formatSyntechTempo(raw: string) {
  const text = raw.trim();
  const colon = text.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (!colon) return text.slice(0, 6);

  const third = colon[3] ? Number(colon[3]) : null;
  let minutes: number;
  let seconds: number;

  if (third !== null) {
    minutes = Number(colon[1]) * 60 + Number(colon[2]);
    seconds = third;
  } else {
    minutes = Number(colon[1]);
    seconds = Number(colon[2]);
  }

  return `${String(minutes).padStart(2, '0')} :${String(seconds).padStart(2, '0')}`;
}

/** Tempo Syntech ou MM:SS → segundos totais (campo TEMPOM). */
export function tempoToTempom(raw: string) {
  const text = formatSyntechTempo(raw);
  const colon = text.match(/^(\d+)\s*:(\d{1,2})$/);
  if (!colon) return 0;
  return Number(colon[1]) * 60 + Number(colon[2]);
}
