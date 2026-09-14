import { repairSyntechText } from '../shared/syntech-name-match';
import {
  attachSyntechDb,
  clipSyntechText,
  detachDb,
  queryDb,
  queryTx,
  runInTransaction,
} from './syntech-db';

export type SyntechMotivoParada = {
  tipo: number;
  codigo: number;
  letra: 'M' | 'N';
  familia: 'mecanica' | 'outras';
  nome: string;
};

function fbStr(value: unknown) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return repairSyntechText(value.toString('latin1')).trim();
  return repairSyntechText(String(value)).trim();
}

function fbNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function padCracha(raw: string) {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';
  return digits.slice(-8).padStart(8, '0');
}

function spNow() {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [ymd, hms] = s.split(' ');
  const [hour, minute, second] = (hms ?? '00:00:00').split(':').map(Number);
  return {
    ymd,
    seconds: hour * 3600 + minute * 60 + (second || 0),
  };
}

function spYmd(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  }
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10);
  return spNow().ymd;
}

function dayDiff(fromYmd: string, toYmd: string) {
  const from = new Date(`${fromYmd}T12:00:00.000-03:00`);
  const to = new Date(`${toYmd}T12:00:00.000-03:00`);
  return Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000));
}

export async function listSyntechMotivosParada(): Promise<SyntechMotivoParada[]> {
  const db = await attachSyntechDb();
  try {
    const rows = await queryDb<{ TIPO: number; CODIGO: number; NOME: string | null }>(
      db,
      `SELECT TIPO, CODIGO, CAST(DESCRICAO AS VARCHAR(40)) AS NOME
       FROM TIPO_PARADA
       ORDER BY TIPO, CODIGO`
    );
    return rows.map((row) => {
      const tipo = fbNum(row.TIPO);
      const mecanica = tipo === 1;
      return {
        tipo,
        codigo: fbNum(row.CODIGO),
        letra: mecanica ? 'N' : 'M',
        familia: mecanica ? 'mecanica' : 'outras',
        nome: fbStr(row.NOME),
      };
    });
  } finally {
    await detachDb(db);
  }
}

async function crachaExiste(tx: Parameters<typeof queryTx>[0], cracha: string) {
  const rows = await queryTx<{ CRACHA: string }>(
    tx,
    `SELECT FIRST 1 CAST(CRACHA AS VARCHAR(12)) AS CRACHA
     FROM VENDEDORES
     WHERE CAST(CRACHA AS VARCHAR(12)) = ?`,
    [cracha]
  );
  return rows.length > 0;
}

export async function abrirSyntechParada(input: {
  maquina: number;
  tipo: number;
  codigo: number;
  cracha: string;
  obs?: string;
}) {
  const maquina = Number(input.maquina);
  if (!Number.isInteger(maquina) || maquina < 1 || maquina > 15) {
    throw new Error('Informe a máquina de 1 a 15.');
  }
  const cracha = padCracha(input.cracha);
  if (!cracha) throw new Error('Informe o crachá.');
  const obs = clipSyntechText(String(input.obs ?? ''), 600);

  const db = await attachSyntechDb();
  try {
    return await runInTransaction(db, async (tx) => {
      if (!(await crachaExiste(tx, cracha))) {
        throw new Error(`Crachá ${cracha} não existe no Syntech.`);
      }
      const aberta = await queryTx(
        tx,
        `SELECT FIRST 1 AUTOINC FROM MANUTENCAO
         WHERE MAQUINA = ?
           AND DATA_TERMINO IS NULL
           AND FINAL IS NULL`,
        [maquina]
      );
      if (aberta.length > 0) {
        throw new Error(`A máquina ${maquina} já tem parada aberta no Syntech.`);
      }
      const motivoRows = await queryTx<{ NOME: string | null; TIPO: number }>(
        tx,
        `SELECT CAST(DESCRICAO AS VARCHAR(40)) AS NOME, TIPO
         FROM TIPO_PARADA
         WHERE TIPO = ? AND CODIGO = ?`,
        [Number(input.tipo), Number(input.codigo)]
      );
      const motivo = motivoRows[0];
      if (!motivo) throw new Error('Motivo de parada não encontrado no Syntech.');
      const letra = fbNum(motivo.TIPO) === 1 ? 'N' : 'M';
      const nome = String(motivo.NOME ?? '').replace(/\u0000/g, '').trim() || 'PARADA';
      const inicio = spNow().seconds;
      await queryTx(
        tx,
        `INSERT INTO MANUTENCAO (MAQUINA, INICIO, TIPO, MOTIVO, CRACHA, OBS)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [maquina, inicio, letra, nome, cracha, obs]
      );
      return { ok: true as const, maquina, motivo: nome, cracha };
    });
  } finally {
    await detachDb(db);
  }
}

export async function encerrarSyntechParada(input: { maquina: number; cracha: string }) {
  const maquina = Number(input.maquina);
  if (!Number.isInteger(maquina) || maquina < 1 || maquina > 15) {
    throw new Error('Informe a máquina de 1 a 15.');
  }
  const cracha = padCracha(input.cracha);
  if (!cracha) throw new Error('Informe o crachá.');

  const db = await attachSyntechDb();
  try {
    return await runInTransaction(db, async (tx) => {
      if (!(await crachaExiste(tx, cracha))) {
        throw new Error(`Crachá ${cracha} não existe no Syntech.`);
      }
      const aberta = await queryTx<{ AUTOINC: number; DATA: unknown; INICIO: number }>(
        tx,
        `SELECT FIRST 1 AUTOINC, DATA, INICIO
         FROM MANUTENCAO
         WHERE MAQUINA = ?
           AND DATA_TERMINO IS NULL
           AND FINAL IS NULL
         ORDER BY AUTOINC DESC`,
        [maquina]
      );
      const row = aberta[0];
      if (!row) throw new Error(`A máquina ${maquina} não tem parada aberta.`);
      const now = spNow();
      const dias = dayDiff(spYmd(row.DATA), now.ymd);
      const horaTermino = now.seconds;
      const final = dias * 86_400 + horaTermino;
      await queryTx(
        tx,
        `UPDATE MANUTENCAO
         SET FINAL = ?,
             DATA_TERMINO = ?,
             HORA_TERMINO = ?,
             CRACHA_FINAL = ?
         WHERE AUTOINC = ?
           AND DATA_TERMINO IS NULL
           AND FINAL IS NULL`,
        [final, new Date(), horaTermino, cracha, row.AUTOINC]
      );
      return { ok: true as const, maquina, cracha };
    });
  } finally {
    await detachDb(db);
  }
}
