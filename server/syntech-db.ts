import './setup-firebird-client';

import net from 'node:net';
import Firebird from 'node-firebird';

export function syntechFbConfig() {
  return {
    host: process.env.SYNTECH_FB_HOST ?? 'RENATA',
    port: Number(process.env.SYNTECH_FB_PORT ?? 3050),
    database: process.env.SYNTECH_FB_DATABASE ?? 'C:\\Textil\\Empresas\\FABRICA.MDB',
    user: process.env.SYNTECH_FB_USER ?? 'SYSDBA',
    password: process.env.SYNTECH_FB_PASSWORD ?? 'masterkey',
    lowercase_keys: false,
    pageSize: 4096,
  };
}

export const SYNTech_FB_CONFIG = syntechFbConfig();

export type FirebirdDb = Firebird.Database;
export type SyntechTx = Firebird.Transaction;

function isIp(host: string) {
  return /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host);
}

function probeTcp(host: string, port: number, ms = 2500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(ms);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

function attachWithHost(host: string): Promise<FirebirdDb> {
  return new Promise((resolve, reject) => {
    Firebird.attach({ ...syntechFbConfig(), host }, (err, db) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

export async function attachSyntechDb(): Promise<FirebirdDb> {
  const configured = syntechFbConfig().host;
  const hosts = [
    ...new Set([
      ...(isIp(configured) ? [configured] : []),
      '192.168.1.52',
      '192.168.1.69',
      configured,
      'RENATA',
    ]),
  ];
  let lastErr: unknown;
  for (const host of hosts) {
    const reachable = await probeTcp(host, syntechFbConfig().port);
    if (!reachable) {
      console.warn(`Syntech porta 3050 fechada em ${host}`);
      lastErr = new Error(`Porta 3050 fechada em ${host}`);
      continue;
    }
    try {
      const db = await attachWithHost(host);
      if (host !== configured) console.warn(`Syntech conectou em ${host}`);
      return db;
    } catch (err) {
      lastErr = err;
      console.warn(`Syntech falhou em ${host}:`, err instanceof Error ? err.message : err);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Nao conectou no Syntech.');
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

/** Campos VARCHAR do Syntech contam bytes — tira acento e limita tamanho. */
export function clipSyntechText(value: string, maxLen: number) {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
  return ascii.slice(0, maxLen);
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

  return clipSyntechText(
    `${String(minutes).padStart(2, '0')} :${String(seconds).padStart(2, '0')}`,
    6
  );
}

/** Tempo Syntech ou MM:SS → segundos totais (campo TEMPOM). */
export function tempoToTempom(raw: string) {
  const text = formatSyntechTempo(raw);
  const colon = text.match(/^(\d+)\s*:(\d{1,2})$/);
  if (!colon) return 0;
  return Number(colon[1]) * 60 + Number(colon[2]);
}
