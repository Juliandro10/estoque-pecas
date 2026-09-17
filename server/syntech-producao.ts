import { repairSyntechText } from '../shared/syntech-name-match';
import { attachSyntechDb, detachDb, queryDb, type FirebirdDb } from './syntech-db';

export const PRODUCAO_STALE_DAYS = 60;
export const PRODUCAO_HOURS_PER_DAY = 20;

export type SyntechGauge = '7.2' | '6.2' | '3.5';

export type ProducaoOpSize = {
  tam: string;
  cor: string;
  quantidade: number;
  produzida: number;
  restante: number;
};

export type ProducaoOp = {
  op: number;
  pedido: number | null;
  cliente: string;
  referencia: string;
  programa: string;
  produto: string;
  maquina: number;
  maquina_nome: string;
  galga: SyntechGauge | null;
  status: number;
  status_nome: string;
  situacao: 'maquina' | 'produzindo' | 'espera';
  data: string | null;
  prazo: string | null;
  quantidade: number;
  produzida: number;
  restante: number;
  horas_restantes: number | null;
  previsao: string | null;
  previsao_pedido: string | null;
  ultima_baixa: string | null;
  ops_no_pedido: number;
  maquinas_pedido: number[];
  tamanhos: ProducaoOpSize[];
};

export type ProducaoAgora = {
  maquina: number;
  item_op: number;
  op: number;
  pedido: number | null;
  cliente: string;
  programa: string;
  tam: string;
  cor: string;
  quantidade: number;
  restante: number;
  fila_ordens: number;
  fila_pecas: number;
  inicio: string | null;
  operador: string;
  processo: string;
  previsao_pedido: string | null;
  livre_em: string | null;
  ops_no_pedido: number;
  maquinas_pedido: number[];
};

export type ProducaoPedido = {
  pedido: number | null;
  cliente: string;
  prazo: string | null;
  previsao: string | null;
  maquinas_livres_em: string | null;
  ops: number;
  quantidade: number;
  produzida: number;
  restante: number;
  horas_restantes: number | null;
  atrasado: boolean;
  referencias: string[];
  maquinas: number[];
  galga: SyntechGauge | null;
  sugestao_maquina: number | null;
  sugestao_entra_em: string | null;
};

export type ProducaoSugestao = {
  pedido: number | null;
  programa: string;
  prazo: string | null;
  entra_em: string | null;
  previsao: string | null;
};

export type ProducaoMaquina = {
  numero: number;
  nome: string;
  galga: SyntechGauge | null;
  grupo: boolean;
  agora: ProducaoAgora | null;
  ops: ProducaoOp[];
  sugestao: ProducaoSugestao | null;
  parada: { motivo: string; obs: string; familia: 'mecanica' | 'processo' } | null;
};

export type ProducaoBoard = {
  updated_at: string;
  stale_days: number;
  machines: ProducaoMaquina[];
  agora: ProducaoAgora[];
  ops: ProducaoOp[];
  pedidos: ProducaoPedido[];
};

const STATUS_NOME: Record<number, string> = {
  1: 'A produzir',
  2: 'Em produção',
  3: 'Parc. produzida',
  4: 'Produzida',
};

async function queryInChunks<T>(db: FirebirdDb, sql: (placeholders: string) => string, values: unknown[]) {
  const chunkSize = 80;
  const rows: T[] = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    rows.push(...(await queryDb<T>(db, sql(chunk.map(() => '?').join(', ')), chunk)));
  }
  return rows;
}

function fbStr(value: unknown) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return repairSyntechText(value.toString('latin1')).trim();
  return repairSyntechText(String(value)).trim();
}

function fbNum(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function fbDate(value: unknown): string | null {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

export function gaugeFromMachine(maquina: number | null): SyntechGauge | null {
  if (maquina == null) return null;
  if (maquina === 50 || (maquina >= 1 && maquina <= 4)) return '7.2';
  if (maquina === 51 || (maquina >= 5 && maquina <= 9)) return '6.2';
  if (maquina === 52 || (maquina >= 10 && maquina <= 15)) return '3.5';
  return null;
}

function parseTempoSeconds(raw: string | number | null) {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).trim());
  return Number.isFinite(n) && n > 0 ? n : null;
}

function secondsToClock(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

type SpWall = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

function readSpWall(date = new Date()): SpWall {
  const s = date.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' });
  const [ymd, hms] = s.split(' ');
  const [year, month, day] = ymd.split('-').map(Number);
  const [hour, minute] = hms.split(':').map(Number);
  return { year, month, day, hour, minute };
}

function wallYmd(w: SpWall) {
  return `${w.year}-${pad2(w.month)}-${pad2(w.day)}`;
}

function wallIso(w: SpWall) {
  return `${wallYmd(w)}T${pad2(w.hour)}:${pad2(w.minute)}`;
}

function weekdayOf(w: SpWall) {
  return new Date(`${wallYmd(w)}T12:00:00.000-03:00`).getUTCDay();
}

function addDaysWall(w: SpWall, days: number): SpWall {
  const dt = new Date(`${wallYmd(w)}T12:00:00.000-03:00`);
  dt.setUTCDate(dt.getUTCDate() + days);
  const ymd = dt.toLocaleString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 10);
  const [year, month, day] = ymd.split('-').map(Number);
  return { ...w, year, month, day };
}

function addWorkingHours(startDate: string, hours: number, hoursPerDay: number) {
  const workStart = 6;
  const remainingStart = Number.isFinite(hours) ? Math.max(0, hours) : 0;
  const now = readSpWall();
  if (remainingStart <= 0) {
    return `${startDate}T${pad2(now.hour)}:${pad2(now.minute)}`;
  }

  const snapToShift = (w: SpWall): SpWall => {
    let cur = { ...w };
    while (weekdayOf(cur) === 0 || weekdayOf(cur) === 6) {
      cur = addDaysWall(cur, 1);
      cur.hour = workStart;
      cur.minute = 0;
    }
    if (cur.hour * 60 + cur.minute < workStart * 60) {
      cur.hour = workStart;
      cur.minute = 0;
    }
    return cur;
  };

  let remaining = remainingStart;
  let wall = snapToShift(now);
  let guard = 0;
  while (remaining > 1 / 60 && guard < 800) {
    wall = snapToShift(wall);
    const nowMin = wall.hour * 60 + wall.minute;
    const endMin = workStart * 60 + hoursPerDay * 60;
    const leftToday = (endMin - nowMin) / 60;
    if (leftToday <= 0) {
      wall = addDaysWall(wall, 1);
      wall.hour = workStart;
      wall.minute = 0;
      guard += 1;
      continue;
    }
    if (remaining <= leftToday) {
      const total = nowMin + Math.round(remaining * 60);
      wall.hour = Math.floor(total / 60) % 24;
      wall.minute = total % 60;
      const extraDays = Math.floor(total / (24 * 60));
      if (extraDays) wall = addDaysWall(wall, extraDays);
      remaining = 0;
    } else {
      remaining -= leftToday;
      wall = addDaysWall(wall, 1);
      wall.hour = workStart;
      wall.minute = 0;
    }
    guard += 1;
  }
  return wallIso(wall);
}

function todayIso() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function staleCutoffDate() {
  const d = new Date();
  d.setDate(d.getDate() - PRODUCAO_STALE_DAYS);
  d.setHours(0, 0, 0, 0);
  return d;
}

function tempoForSize(tempos: Map<string, Map<string, number>>, referencia: string, tam: string) {
  const bySize = tempos.get(referencia);
  if (!bySize) return null;
  return bySize.get(tam) ?? bySize.get('*') ?? null;
}

function secondsForPiece(
  temposMaq: Map<string, Map<string, number>>,
  fichaSegundos: Map<string, number>,
  referencia: string,
  tam: string
) {
  return tempoForSize(temposMaq, referencia, tam) ?? (fichaSegundos.get(referencia) || null);
}

function hoursForPieces(
  temposMaq: Map<string, Map<string, number>>,
  fichaSegundos: Map<string, number>,
  referencia: string,
  tam: string,
  restante: number
) {
  if (restante <= 0) return 0;
  const seconds = secondsForPiece(temposMaq, fichaSegundos, referencia, tam);
  if (seconds == null) return null;
  return (restante * seconds) / 3600;
}

function knitDoneForItem(produced: Map<number, Map<number, number>>, item: number) {
  const byProc = produced.get(item);
  if (!byProc || byProc.size === 0) return 0;
  return Math.min(...byProc.values());
}

function compareOps(a: ProducaoOp, b: ProducaoOp) {
  const rank = { maquina: 0, produzindo: 1, espera: 2 };
  if (rank[a.situacao] !== rank[b.situacao]) return rank[a.situacao] - rank[b.situacao];
  const prazoA = a.prazo ?? '9999-12-31';
  const prazoB = b.prazo ?? '9999-12-31';
  if (prazoA !== prazoB) return prazoA.localeCompare(prazoB);
  return a.op - b.op;
}

function listMaquinas(values: number[]) {
  return [...new Set(values.filter((n) => n >= 1 && n <= 15))].sort((a, b) => a - b);
}

function foldText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const MOTIVO_LABEL: Record<string, string> = {
  'AJUSTE MECANICO': 'Ajuste mecânico',
  'LIMPEZA COMPLETA': 'Limpeza completa',
  'LIMPEZA PARCIAL': 'Limpeza parcial',
  'MANUTENCAO': 'Manutenção',
  'ABORTO DE MODELO': 'Aborto de modelo',
  'APROVACAO DE MODELO': 'Aprovação de modelo',
  'FALTA DE FIO': 'Falta de fio',
  'PARADA POR MAU TEMPO': 'Parada por mau tempo',
  'QUEDA DE ENERGIA': 'Queda de energia',
  'REPOSICAO': 'Reposição',
  'TESTE DE PROGRAMA': 'Teste de programa',
  'TROCA DE PROGRAMA': 'Troca de programa',
  'TROCA DE MAQUINA': 'Troca de máquina',
  'DESENVOLVIMENTO': 'Desenvolvimento',
  'ERRO DE TECIMENTO': 'Erro de tecimento',
};

function prettyMotivo(motivo: string) {
  const folded = foldText(motivo);
  if (MOTIVO_LABEL[folded]) return MOTIVO_LABEL[folded];
  if (folded.startsWith('MANUTEN')) return 'Manutenção';
  const text = motivo.trim();
  if (!text) return 'Parada';
  return text.toLocaleLowerCase('pt-BR').replace(/(^|\s)\S/g, (ch) => ch.toLocaleUpperCase('pt-BR'));
}

function familiaDeMotivo(motivo: string, tipoPorNome: Map<string, number>): 'mecanica' | 'processo' {
  const folded = foldText(motivo);
  const tipo = tipoPorNome.get(folded);
  if (tipo === 1) return 'mecanica';
  if (tipo === 2) return 'processo';
  if (/(MANUTEN|AJUSTE|LIMPEZA)/.test(folded)) return 'mecanica';
  return 'processo';
}

async function readParadasAbertas(db: FirebirdDb) {
  const tipos = await queryDb<{ TIPO: number; NOME: string | null }>(
    db,
    `SELECT TIPO, CAST(DESCRICAO AS VARCHAR(40)) AS NOME FROM TIPO_PARADA`
  );
  const tipoPorNome = new Map<string, number>();
  for (const row of tipos) {
    const nome = foldText(fbStr(row.NOME));
    if (nome) tipoPorNome.set(nome, fbNum(row.TIPO));
  }

  const abertas = await queryDb<{ MAQUINA: number; MOTIVO: string | null; OBS: string | null }>(
    db,
    `SELECT MAQUINA, CAST(MOTIVO AS VARCHAR(40)) AS MOTIVO, CAST(OBS AS VARCHAR(200)) AS OBS
     FROM MANUTENCAO
     WHERE DATA_TERMINO IS NULL
       AND FINAL IS NULL
     ORDER BY AUTOINC`
  );

  const byMachine = new Map<number, { motivo: string; obs: string; familia: 'mecanica' | 'processo' }>();
  for (const row of abertas) {
    const maquina = fbNum(row.MAQUINA);
    if (maquina < 1 || maquina > 15) continue;
    const raw = fbStr(row.MOTIVO);
    const motivo = prettyMotivo(raw);
    const obs = fbStr(row.OBS).replace(/\s+/g, ' ').trim();
    byMachine.set(maquina, {
      motivo,
      obs,
      familia: familiaDeMotivo(raw, tipoPorNome),
    });
  }
  return byMachine;
}

const MAQUINAS_DA_GALGA: Record<SyntechGauge, number[]> = {
  '7.2': [1, 2, 3, 4],
  '6.2': [5, 6, 7, 8, 9],
  '3.5': [10, 11, 12, 13, 14, 15],
};

export async function readSyntechProducaoBoard(): Promise<ProducaoBoard> {
  const db = await attachSyntechDb();
  const cutoff = staleCutoffDate();
  const baixaSince = new Date();
  baixaSince.setDate(baixaSince.getDate() - 90);

  try {
    const liveRows = await queryDb<{
      NUM_LOTE: number;
      PROCESSO: number;
      CRACHA: string | null;
      INICIO: number | null;
      PROC_NOME: string | null;
      OPERADOR: string | null;
    }>(
      db,
      `SELECT T.NUM_LOTE, T.PROCESSO, CAST(T.CRACHA AS VARCHAR(12)) AS CRACHA, T.INICIO,
              CAST(PR.DESCRICAO AS VARCHAR(30)) AS PROC_NOME,
              CAST(V.NOME AS VARCHAR(40)) AS OPERADOR
       FROM TEMPOS T
       JOIN PROCESSOS PR ON PR.NUMERO = T.PROCESSO
       LEFT JOIN VENDEDORES V ON V.CRACHA = T.CRACHA
       WHERE T.DATA_TERMINO IS NULL
         AND T.FINAL IS NULL
         AND PR.TECIMENTO = 'S'`
    );

    const liveLots = [...new Set(liveRows.map((row) => fbNum(row.NUM_LOTE)).filter(Boolean))];

    const osmRows =
      liveLots.length === 0
        ? []
        : await queryDb<{ NUM_ITEM: number; PROCESSO: number; MAQUINA: number }>(
            db,
            `SELECT NUM_ITEM, PROCESSO, MAQUINA FROM ORDEM_SERVICO_MAQ
             WHERE NUM_ITEM IN (${liveLots.map(() => '?').join(', ')})`,
            liveLots
          );

    const itemToMachine = new Map<number, number>();
    for (const row of osmRows) {
      const maquina = fbNum(row.MAQUINA);
      if (maquina < 1 || maquina > 15) continue;
      const item = fbNum(row.NUM_ITEM);
      if (!itemToMachine.has(item)) itemToMachine.set(item, maquina);
    }

    const liveItemMeta = new Map<
      number,
      { inicio: number | null; operador: string; processo: string }
    >();
    for (const row of liveRows) {
      const item = fbNum(row.NUM_LOTE);
      const current = liveItemMeta.get(item);
      const inicio = row.INICIO == null ? null : fbNum(row.INICIO);
      if (!current || (inicio != null && (current.inicio == null || inicio < current.inicio))) {
        liveItemMeta.set(item, {
          inicio,
          operador: fbStr(row.OPERADOR),
          processo: fbStr(row.PROC_NOME),
        });
      }
    }

    const opHeaders = await queryDb<{
      NUMERO: number;
      DATA: Date | string | null;
      DATA_ENTREGA: Date | string | null;
      COD_PROD: string | null;
      MAQUINA: number | null;
      STATUS: number | null;
      PEDIDO: number | null;
      CLIENTE: number | null;
    }>(
      db,
      `SELECT O.NUMERO, O.DATA, O.DATA_ENTREGA, CAST(O.COD_PROD AS VARCHAR(13)) AS COD_PROD,
              O.MAQUINA, O.STATUS, O.PEDIDO, O.CLIENTE
       FROM ORDEM_SERVICO O
       LEFT JOIN PEDIDO PD ON PD.NUMERO = O.PEDIDO
       WHERE O.STATUS IN (1, 2, 3)
         AND (PD.CANC IS NULL OR PD.CANC <> 'S')
         AND O.DATA_ENTREGA >= ?`,
      [cutoff]
    );

    const itemRows = await queryDb<{
      NUM_ITEM: number;
      NUMERO_OS: number;
      TAM: string | null;
      QUANT: number | null;
      PRODUZIDA: number | null;
      COR: number | null;
    }>(
      db,
      `SELECT I.NUM_ITEM, I.NUMERO_OS, CAST(I.TAM AS VARCHAR(3)) AS TAM, I.QUANT, I.PRODUZIDA,
              COALESCE(I.COR3, I.COR1, I.COR6) AS COR
       FROM ITENS_OS I
       JOIN ORDEM_SERVICO O ON O.NUMERO = I.NUMERO_OS
       LEFT JOIN PEDIDO PD ON PD.NUMERO = O.PEDIDO
       WHERE O.STATUS IN (1, 2, 3)
         AND (PD.CANC IS NULL OR PD.CANC <> 'S')
         AND O.DATA_ENTREGA >= ?`,
      [cutoff]
    );

    const livePedidosFromItems = new Set<number>();
    const liveOpFromItem = new Map<number, number>();
    for (const row of itemRows) {
      const item = fbNum(row.NUM_ITEM);
      liveOpFromItem.set(item, fbNum(row.NUMERO_OS));
    }

    if (liveLots.length > 0) {
      const extraItems = await queryDb<{
        NUM_ITEM: number;
        NUMERO_OS: number;
        TAM: string | null;
        QUANT: number | null;
        PRODUZIDA: number | null;
        COR: number | null;
        PEDIDO: number | null;
        NUMERO: number;
        DATA: Date | string | null;
        DATA_ENTREGA: Date | string | null;
        COD_PROD: string | null;
        MAQUINA: number | null;
        STATUS: number | null;
        CLIENTE: number | null;
      }>(
        db,
        `SELECT I.NUM_ITEM, I.NUMERO_OS, CAST(I.TAM AS VARCHAR(3)) AS TAM, I.QUANT, I.PRODUZIDA,
                COALESCE(I.COR3, I.COR1, I.COR6) AS COR,
                O.PEDIDO, O.NUMERO, O.DATA, O.DATA_ENTREGA, CAST(O.COD_PROD AS VARCHAR(13)) AS COD_PROD,
                O.MAQUINA, O.STATUS, O.CLIENTE
         FROM ITENS_OS I
         JOIN ORDEM_SERVICO O ON O.NUMERO = I.NUMERO_OS
         WHERE I.NUM_ITEM IN (${liveLots.map(() => '?').join(', ')})`,
        liveLots
      );

      for (const row of extraItems) {
        liveOpFromItem.set(fbNum(row.NUM_ITEM), fbNum(row.NUMERO_OS));
        if (row.PEDIDO != null) livePedidosFromItems.add(fbNum(row.PEDIDO));
        if (!opHeaders.some((header) => fbNum(header.NUMERO) === fbNum(row.NUMERO))) {
          opHeaders.push(row);
        }
        if (!itemRows.some((item) => fbNum(item.NUM_ITEM) === fbNum(row.NUM_ITEM))) {
          itemRows.push(row);
        }
      }
    }

    const siblingPedidos = [...livePedidosFromItems];
    if (siblingPedidos.length > 0) {
      const siblingOps = await queryDb<(typeof opHeaders)[number]>(
        db,
        `SELECT O.NUMERO, O.DATA, O.DATA_ENTREGA, CAST(O.COD_PROD AS VARCHAR(13)) AS COD_PROD,
                O.MAQUINA, O.STATUS, O.PEDIDO, O.CLIENTE
         FROM ORDEM_SERVICO O
         LEFT JOIN PEDIDO PD ON PD.NUMERO = O.PEDIDO
         WHERE O.STATUS IN (1, 2, 3)
           AND (PD.CANC IS NULL OR PD.CANC <> 'S')
           AND O.PEDIDO IN (${siblingPedidos.map(() => '?').join(', ')})`,
        siblingPedidos
      );
      for (const row of siblingOps) {
        if (!opHeaders.some((header) => fbNum(header.NUMERO) === fbNum(row.NUMERO))) {
          opHeaders.push(row);
        }
      }

      const siblingItems = await queryDb<(typeof itemRows)[number]>(
        db,
        `SELECT I.NUM_ITEM, I.NUMERO_OS, CAST(I.TAM AS VARCHAR(3)) AS TAM, I.QUANT, I.PRODUZIDA,
                COALESCE(I.COR3, I.COR1, I.COR6) AS COR
         FROM ITENS_OS I
         JOIN ORDEM_SERVICO O ON O.NUMERO = I.NUMERO_OS
         WHERE O.PEDIDO IN (${siblingPedidos.map(() => '?').join(', ')})
           AND O.STATUS IN (1, 2, 3)`,
        siblingPedidos
      );
      for (const row of siblingItems) {
        if (!itemRows.some((item) => fbNum(item.NUM_ITEM) === fbNum(row.NUM_ITEM))) {
          itemRows.push(row);
        }
      }
    }

    const maqRows = await queryDb<{ NUMERO: number; DESCRICAO: string | null }>(
      db,
      `SELECT NUMERO, CAST(DESCRICAO AS VARCHAR(40)) AS DESCRICAO
       FROM MAQUINAS
       WHERE NUMERO BETWEEN 1 AND 15 OR NUMERO IN (50, 51, 52)
       ORDER BY NUMERO`
    );
    const paradasAbertas = await readParadasAbertas(db);

    const allItemIds = [...new Set(itemRows.map((row) => fbNum(row.NUM_ITEM)).filter(Boolean))];

    const osmAllRows =
      allItemIds.length === 0
        ? []
        : await queryInChunks<{ NUM_ITEM: number; PROCESSO: number; MAQUINA: number }>(
            db,
            (placeholders) =>
              `SELECT M.NUM_ITEM, M.PROCESSO, M.MAQUINA
               FROM ORDEM_SERVICO_MAQ M
               JOIN PROCESSOS PR ON PR.NUMERO = M.PROCESSO
               WHERE PR.TECIMENTO = 'S'
                 AND M.NUM_ITEM IN (${placeholders})`,
            allItemIds
          );

    const knitQtyRows =
      allItemIds.length === 0
        ? []
        : await queryInChunks<{ NUM_LOTE: number; PROCESSO: number; Q: number }>(
            db,
            (placeholders) =>
              `SELECT T.NUM_LOTE, T.PROCESSO, SUM(T.QUANT) AS Q
               FROM TEMPOS T
               JOIN PROCESSOS PR ON PR.NUMERO = T.PROCESSO
               WHERE PR.TECIMENTO = 'S'
                 AND T.DATA_TERMINO IS NOT NULL
                 AND T.NUM_LOTE IN (${placeholders})
               GROUP BY T.NUM_LOTE, T.PROCESSO`,
            allItemIds
          );

    const tempoRows = await queryDb<{
      COD_PROD: string | null;
      TAMANHO: string | null;
      TEMPO: string | number | null;
    }>(
      db,
      `SELECT CAST(COD_PROD AS VARCHAR(13)) AS COD_PROD,
              CAST(TAMANHO AS VARCHAR(3)) AS TAMANHO,
              CAST(TEMPO AS VARCHAR(8)) AS TEMPO
       FROM TEMPO_MAQ_PROD`
    );

    const fichaRows = await queryDb<{
      PRODUTO: string | null;
      TEMPOM: number | null;
    }>(
      db,
      `SELECT CAST(PRODUTO AS VARCHAR(13)) AS PRODUTO, TEMPOM
       FROM TEMPO_PESO_PROD
       WHERE TEMPOM IS NOT NULL AND TEMPOM > 0`
    );

    const baixaRows = await queryDb<{ NUMERO_OS: number; ULTIMA: Date | string | null }>(
      db,
      `SELECT I.NUMERO_OS, MAX(B.DATA) AS ULTIMA
       FROM BAIXA_PRODUCAO B
       JOIN ITENS_OS I ON I.NUM_ITEM = B.NUMERO
       WHERE B.DATA >= ?
         AND (B.TIPO IS NULL OR B.TIPO = 'P')
       GROUP BY I.NUMERO_OS`,
      [baixaSince]
    );

    const productCodes = [...new Set(opHeaders.map((row) => fbStr(row.COD_PROD)).filter(Boolean))];
    const clientCodes = [...new Set(opHeaders.map((row) => fbNum(row.CLIENTE)).filter(Boolean))];
    const colorCodes = [...new Set(itemRows.map((row) => fbNum(row.COR)).filter(Boolean))];

    const prodRows =
      productCodes.length === 0
        ? []
        : await queryInChunks<{ CODIGO: string; PROGRAMA: string | null; NOME: string | null }>(
            db,
            (placeholders) =>
              `SELECT CAST(CODIGO AS VARCHAR(13)) AS CODIGO,
                      CAST(PROGRAMA AS VARCHAR(40)) AS PROGRAMA,
                      CAST(NOME AS VARCHAR(60)) AS NOME
               FROM PRODUTOS WHERE CODIGO IN (${placeholders})`,
            productCodes
          );
    const clientRows =
      clientCodes.length === 0
        ? []
        : await queryInChunks<{ CODIGO: number; NOME: string | null }>(
            db,
            (placeholders) =>
              `SELECT CODIGO, CAST(NOME AS VARCHAR(60)) AS NOME FROM CLIENTES WHERE CODIGO IN (${placeholders})`,
            clientCodes
          );
    const colorRows =
      colorCodes.length === 0
        ? []
        : await queryInChunks<{ NUMERO: number; NOME: string | null }>(
            db,
            (placeholders) =>
              `SELECT NUMERO, CAST(NOME AS VARCHAR(40)) AS NOME FROM CORES WHERE NUMERO IN (${placeholders})`,
            colorCodes
          );

    const products = new Map(prodRows.map((row) => [fbStr(row.CODIGO), row]));
    const clients = new Map(clientRows.map((row) => [fbNum(row.CODIGO), fbStr(row.NOME)]));
    const colors = new Map(colorRows.map((row) => [fbNum(row.NUMERO), fbStr(row.NOME)]));
    const maquinas = new Map(maqRows.map((row) => [fbNum(row.NUMERO), fbStr(row.DESCRICAO)]));

    const tempos = new Map<string, Map<string, number>>();
    for (const row of tempoRows) {
      const ref = fbStr(row.COD_PROD);
      const seconds = parseTempoSeconds(row.TEMPO);
      if (!ref || seconds == null) continue;
      const tam = fbStr(row.TAMANHO) || '*';
      const bySize = tempos.get(ref) ?? new Map<string, number>();
      bySize.set(tam, seconds);
      tempos.set(ref, bySize);
    }

    const fichaSegundos = new Map<string, number>();
    for (const row of fichaRows) {
      const ref = fbStr(row.PRODUTO);
      const seconds = fbNum(row.TEMPOM);
      if (!ref || seconds <= 0) continue;
      fichaSegundos.set(ref, (fichaSegundos.get(ref) ?? 0) + seconds);
    }

    const knitProduced = new Map<number, Map<number, number>>();
    for (const row of knitQtyRows) {
      const item = fbNum(row.NUM_LOTE);
      const processo = fbNum(row.PROCESSO);
      const qty = fbNum(row.Q);
      const byProc = knitProduced.get(item) ?? new Map<number, number>();
      byProc.set(processo, qty);
      knitProduced.set(item, byProc);
    }

    for (const row of osmAllRows) {
      const maquina = fbNum(row.MAQUINA);
      if (maquina < 1 || maquina > 15) continue;
      const item = fbNum(row.NUM_ITEM);
      if (!itemToMachine.has(item)) itemToMachine.set(item, maquina);
    }

    const ultimaBaixa = new Map<number, string | null>();
    for (const row of baixaRows) {
      ultimaBaixa.set(fbNum(row.NUMERO_OS), fbDate(row.ULTIMA));
    }

    type DraftItem = ProducaoOpSize & { item: number };

    type Draft = {
      op: number;
      pedido: number | null;
      cliente: string;
      referencia: string;
      programa: string;
      produto: string;
      maquina: number;
      maquina_nome: string;
      status: number;
      data: string | null;
      prazo: string | null;
      tamanhos: ProducaoOpSize[];
      items: Map<number, DraftItem>;
    };

    const grouped = new Map<number, Draft>();
    for (const row of opHeaders) {
      const op = fbNum(row.NUMERO);
      if (!op) continue;
      const referencia = fbStr(row.COD_PROD);
      const product = products.get(referencia);
      const maquina = fbNum(row.MAQUINA);
      grouped.set(op, {
        op,
        pedido: row.PEDIDO == null ? null : fbNum(row.PEDIDO),
        cliente: clients.get(fbNum(row.CLIENTE)) ?? '',
        referencia,
        programa: fbStr(product?.PROGRAMA),
        produto: fbStr(product?.NOME),
        maquina,
        maquina_nome: maquinas.get(maquina) ?? '',
        status: fbNum(row.STATUS),
        data: fbDate(row.DATA),
        prazo: fbDate(row.DATA_ENTREGA),
        tamanhos: [],
        items: new Map(),
      });
    }

    for (const row of itemRows) {
      const current = grouped.get(fbNum(row.NUMERO_OS));
      if (!current) continue;
      const quantidade = fbNum(row.QUANT);
      const item = fbNum(row.NUM_ITEM);
      const tecida = Math.min(quantidade, knitDoneForItem(knitProduced, item));
      const restante = Math.max(0, quantidade - tecida);
      const tam = fbStr(row.TAM) || '—';
      const cor = colors.get(fbNum(row.COR)) ?? '';
      current.items.set(item, {
        item,
        tam,
        cor,
        quantidade,
        produzida: tecida,
        restante,
      });
      const existing = current.tamanhos.find((size) => size.tam === tam && size.cor === cor);
      if (existing) {
        existing.quantidade += quantidade;
        existing.produzida += tecida;
        existing.restante += restante;
      } else {
        current.tamanhos.push({
          tam,
          cor,
          quantidade,
          produzida: tecida,
          restante,
        });
      }
    }

    const ops: ProducaoOp[] = [];
    const itemHoursByMachine = new Map<number, number>();
    const pedidoHoursByMachine = new Map<number, Map<number, number>>();
    const pedidoItemCount = new Map<number | string, { total: number; restantes: number }>();

    for (const current of grouped.values()) {
      const quantidade = [...current.items.values()].reduce((sum, item) => sum + item.quantidade, 0);
      const produzida = [...current.items.values()].reduce((sum, item) => sum + item.produzida, 0);
      const restante = [...current.items.values()].reduce((sum, item) => sum + item.restante, 0);
      const liveNow = [...current.items.keys()].some((item) => liveLots.includes(item));
      if (restante <= 0 && !liveNow) continue;

      const assignedMachines = listMaquinas(
        [...current.items.keys()].map((item) => itemToMachine.get(item) ?? 0)
      );
      const maquina = assignedMachines[0] ?? current.maquina;

      let hours: number | null = 0;
      let missingTempo = false;
      for (const item of current.items.values()) {
        if (item.restante <= 0) continue;
        const pieceHours = hoursForPieces(
          tempos,
          fichaSegundos,
          current.referencia,
          item.tam,
          item.restante
        );
        if (pieceHours == null) {
          missingTempo = true;
          continue;
        }
        hours += pieceHours;
        const itemMachine = itemToMachine.get(item.item);
        if (itemMachine) {
          itemHoursByMachine.set(itemMachine, (itemHoursByMachine.get(itemMachine) ?? 0) + pieceHours);
          if (current.pedido != null) {
            const byMaq = pedidoHoursByMachine.get(current.pedido) ?? new Map<number, number>();
            byMaq.set(itemMachine, (byMaq.get(itemMachine) ?? 0) + pieceHours);
            pedidoHoursByMachine.set(current.pedido, byMaq);
          }
        }
      }
      if (missingTempo && hours === 0) hours = null;

      const pedidoKey = current.pedido ?? `op-${current.op}`;
      const counts = pedidoItemCount.get(pedidoKey) ?? { total: 0, restantes: 0 };
      counts.total += current.items.size;
      counts.restantes += [...current.items.values()].filter((item) => item.restante > 0).length;
      pedidoItemCount.set(pedidoKey, counts);

      ops.push({
        op: current.op,
        pedido: current.pedido,
        cliente: current.cliente,
        referencia: current.referencia,
        programa: current.programa || current.produto,
        produto: current.produto,
        maquina,
        maquina_nome: maquinas.get(maquina) ?? current.maquina_nome,
        galga: gaugeFromMachine(maquina),
        status: current.status,
        status_nome: STATUS_NOME[current.status] ?? `Status ${current.status}`,
        situacao: liveNow ? 'maquina' : restante > 0 ? 'espera' : 'produzindo',
        data: current.data,
        prazo: current.prazo,
        quantidade,
        produzida,
        restante,
        horas_restantes: hours,
        previsao: null,
        previsao_pedido: null,
        ultima_baixa: ultimaBaixa.get(current.op) ?? null,
        ops_no_pedido: 0,
        maquinas_pedido: [],
        tamanhos: current.tamanhos,
      });
    }

    const today = todayIso();
    const pedidoMaquinas = new Map<number, number[]>();
    for (const [item, maquina] of itemToMachine) {
      const draft = [...grouped.values()].find((row) => row.items.has(item));
      if (draft?.pedido == null) continue;
      const size = draft.items.get(item);
      if (!size || (size.restante <= 0 && !liveLots.includes(item))) continue;
      const list = pedidoMaquinas.get(draft.pedido) ?? [];
      if (!list.includes(maquina)) list.push(maquina);
      pedidoMaquinas.set(draft.pedido, list);
    }

    const pedidoMap = new Map<number | string, ProducaoPedido>();
    for (const op of ops) {
      const key = op.pedido ?? `op-${op.op}`;
      const current = pedidoMap.get(key) ?? {
        pedido: op.pedido,
        cliente: op.cliente,
        prazo: op.prazo,
        previsao: null,
        maquinas_livres_em: null,
        ops: 0,
        quantidade: 0,
        produzida: 0,
        restante: 0,
        horas_restantes: null as number | null,
        atrasado: false,
        referencias: [],
        maquinas: [],
        galga: op.galga,
        sugestao_maquina: null,
        sugestao_entra_em: null,
      };
      current.quantidade += op.quantidade;
      current.produzida += op.produzida;
      current.restante += op.restante;
      if (op.cliente && !current.cliente) current.cliente = op.cliente;
      if (op.prazo && (!current.prazo || op.prazo < current.prazo)) current.prazo = op.prazo;
      if (op.horas_restantes != null) {
        if (current.horas_restantes == null) current.horas_restantes = op.horas_restantes;
        else current.horas_restantes += op.horas_restantes;
      }
      const label = op.programa || op.referencia;
      if (label && !current.referencias.includes(label)) current.referencias.push(label);
      if (op.pedido != null) {
        current.maquinas = listMaquinas([...(pedidoMaquinas.get(op.pedido) ?? []), ...current.maquinas]);
      }
      if (op.galga && !current.galga) current.galga = op.galga;
      current.ops = pedidoItemCount.get(key)?.restantes ?? current.ops;
      pedidoMap.set(key, current);
    }

    const machineFreeOn = new Map<number, string>();
    for (const [maquina, hours] of itemHoursByMachine) {
      machineFreeOn.set(maquina, addWorkingHours(today, hours, PRODUCAO_HOURS_PER_DAY));
    }

    for (const pedido of pedidoMap.values()) {
      const byMaq =
        pedido.pedido != null ? pedidoHoursByMachine.get(pedido.pedido) : undefined;
      if (byMaq && byMaq.size > 0) {
        const dates = [...byMaq.entries()].map(([maquina, hours]) =>
          addWorkingHours(today, hours, PRODUCAO_HOURS_PER_DAY)
        );
        dates.sort();
        pedido.previsao = dates[dates.length - 1] ?? null;
        const livres = pedido.maquinas
          .map((maquina) => machineFreeOn.get(maquina))
          .filter((value): value is string => Boolean(value))
          .sort();
        pedido.maquinas_livres_em = livres[livres.length - 1] ?? pedido.previsao;
      }
      pedido.atrasado = Boolean(pedido.prazo && pedido.prazo < today);
    }

    const cargaMaquina = new Map<number, number>();
    for (let n = 1; n <= 15; n += 1) {
      cargaMaquina.set(n, itemHoursByMachine.get(n) ?? 0);
    }
    const primeiraSugestao = new Map<number, ProducaoSugestao>();
    const espera = [...pedidoMap.values()]
      .filter(
        (pedido) =>
          pedido.maquinas.length === 0 &&
          (pedido.restante ?? 0) > 0 &&
          pedido.horas_restantes != null &&
          pedido.horas_restantes > 0 &&
          pedido.galga != null
      )
      .sort((a, b) => {
        const prazoA = a.prazo ?? '9999-12-31';
        const prazoB = b.prazo ?? '9999-12-31';
        if (prazoA !== prazoB) return prazoA.localeCompare(prazoB);
        return (a.pedido ?? 0) - (b.pedido ?? 0);
      });

    for (const pedido of espera) {
      const galga = pedido.galga;
      if (!galga || pedido.horas_restantes == null) continue;
      const candidatas = MAQUINAS_DA_GALGA[galga];
      let escolhida = candidatas[0];
      let menorCarga = cargaMaquina.get(escolhida) ?? 0;
      for (const numero of candidatas) {
        const carga = cargaMaquina.get(numero) ?? 0;
        if (carga < menorCarga) {
          escolhida = numero;
          menorCarga = carga;
        }
      }
      const horasAntes = menorCarga;
      const horasDepois = horasAntes + pedido.horas_restantes;
      pedido.sugestao_maquina = escolhida;
      pedido.sugestao_entra_em =
        horasAntes <= 0 ? today : addWorkingHours(today, horasAntes, PRODUCAO_HOURS_PER_DAY);
      pedido.previsao = addWorkingHours(today, horasDepois, PRODUCAO_HOURS_PER_DAY);
      cargaMaquina.set(escolhida, horasDepois);
      if (!primeiraSugestao.has(escolhida)) {
        primeiraSugestao.set(escolhida, {
          pedido: pedido.pedido,
          programa: pedido.referencias[0] ?? '',
          prazo: pedido.prazo,
          entra_em: pedido.sugestao_entra_em,
          previsao: pedido.previsao,
        });
      }
    }

    for (const op of ops) {
      const pedido = pedidoMap.get(op.pedido ?? `op-${op.op}`);
      op.ops_no_pedido = pedido?.ops ?? 1;
      op.maquinas_pedido = pedido?.maquinas ?? [];
      op.previsao_pedido = pedido?.previsao ?? null;
      op.previsao = pedido?.previsao ?? null;
    }

    const agora: ProducaoAgora[] = [];
    for (const item of liveLots) {
      const maquina = itemToMachine.get(item);
      if (!maquina) continue;
      const draft = [...grouped.values()].find((row) => row.items.has(item));
      const size = draft?.items.get(item);
      const pedido = draft?.pedido != null ? pedidoMap.get(draft.pedido) : undefined;
      const meta = liveItemMeta.get(item);
      if (!draft || !size) continue;
      const pedidoItems = draft.pedido != null
        ? [...grouped.values()].filter((row) => row.pedido === draft.pedido).flatMap((row) => [...row.items.values()])
        : [...draft.items.values()];
      const fila = pedidoItems.filter(
        (row) => row.item !== item && row.restante > 0 && itemToMachine.get(row.item) === maquina
      );
      agora.push({
        maquina,
        item_op: item,
        op: draft.op,
        pedido: draft.pedido,
        cliente: draft.cliente,
        programa: draft.programa || draft.produto,
        tam: size.tam,
        cor: size.cor,
        quantidade: size.quantidade,
        restante: size.restante,
        fila_ordens: fila.length,
        fila_pecas: fila.reduce((sum, row) => sum + row.restante, 0),
        inicio: meta?.inicio != null ? secondsToClock(meta.inicio) : null,
        operador: meta?.operador ?? '',
        processo: meta?.processo ?? '',
        previsao_pedido: pedido?.previsao ?? null,
        livre_em: machineFreeOn.get(maquina) ?? pedido?.previsao ?? null,
        ops_no_pedido: pedido?.ops ?? 1,
        maquinas_pedido: pedido?.maquinas ?? [maquina],
      });
    }
    agora.sort((a, b) => a.maquina - b.maquina);

    const agoraByMachine = new Map(agora.map((row) => [row.maquina, row]));
    const byMachine = new Map<number, ProducaoOp[]>();
    for (const op of ops) {
      if (op.situacao !== 'maquina') continue;
      for (const maquina of op.maquinas_pedido.length ? op.maquinas_pedido : [op.maquina]) {
        const list = byMachine.get(maquina) ?? [];
        if (!list.some((item) => item.op === op.op)) list.push(op);
        byMachine.set(maquina, list);
      }
    }

    const machines: ProducaoMaquina[] = maqRows.map((row) => {
      const numero = fbNum(row.NUMERO);
      return {
        numero,
        nome: fbStr(row.DESCRICAO),
        galga: gaugeFromMachine(numero),
        grupo: numero >= 50,
        agora: agoraByMachine.get(numero) ?? null,
        ops: (byMachine.get(numero) ?? []).sort(compareOps),
        sugestao: primeiraSugestao.get(numero) ?? null,
        parada: paradasAbertas.get(numero) ?? null,
      };
    });

    const pedidos = [...pedidoMap.values()].sort((a, b) => {
      const liveA = a.maquinas.length ? 0 : 1;
      const liveB = b.maquinas.length ? 0 : 1;
      if (liveA !== liveB) return liveA - liveB;
      const prazoA = a.prazo ?? '9999-12-31';
      const prazoB = b.prazo ?? '9999-12-31';
      if (prazoA !== prazoB) return prazoA.localeCompare(prazoB);
      return (a.pedido ?? 0) - (b.pedido ?? 0);
    });

    return {
      updated_at: new Date().toISOString(),
      stale_days: PRODUCAO_STALE_DAYS,
      machines,
      agora,
      ops: ops.sort(compareOps),
      pedidos,
    };
  } finally {
    await detachDb(db);
  }
}

let quadroCache: ProducaoBoard | null = null;
let quadroCacheAt = 0;
let quadroLive: Promise<ProducaoBoard> | null = null;

export function readSyntechProducaoBoardCached(): Promise<ProducaoBoard> {
  const age = Date.now() - quadroCacheAt;
  if (quadroCache && age < 12_000) return Promise.resolve(quadroCache);
  if (!quadroLive) {
    quadroLive = readSyntechProducaoBoard()
      .then((board) => {
        quadroCache = board;
        quadroCacheAt = Date.now();
        return board;
      })
      .finally(() => {
        quadroLive = null;
      });
  }
  if (quadroCache && age < 5 * 60_000) {
    return Promise.race([
      quadroLive,
      new Promise<ProducaoBoard>((resolve) => {
        setTimeout(() => resolve(quadroCache as ProducaoBoard), 4000);
      }),
    ]);
  }
  return quadroLive;
}
