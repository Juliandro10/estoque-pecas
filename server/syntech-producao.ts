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
  inicio: string | null;
  operador: string;
  processo: string;
  previsao_pedido: string | null;
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
};

export type ProducaoMaquina = {
  numero: number;
  nome: string;
  galga: SyntechGauge | null;
  grupo: boolean;
  agora: ProducaoAgora | null;
  ops: ProducaoOp[];
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

function addWorkingHours(startDate: string, hours: number, hoursPerDay: number) {
  const [year, month, day] = startDate.split('-').map(Number);
  const cursor = new Date(Date.UTC(year, month - 1, day));
  let remaining = Math.max(0, hours);
  if (remaining === 0) return startDate;

  let guard = 0;
  while (remaining > 0 && guard < 800) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday === 0 || weekday === 6) {
      guard += 1;
      continue;
    }
    remaining -= hoursPerDay;
    guard += 1;
  }
  return cursor.toISOString().slice(0, 10);
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

function hoursForSizes(
  tempos: Map<string, Map<string, number>>,
  referencia: string,
  tamanhos: ProducaoOpSize[]
) {
  let hours = 0;
  let missing = tamanhos.length === 0;
  for (const size of tamanhos) {
    if (size.restante <= 0) continue;
    const seconds = tempoForSize(tempos, referencia, size.tam);
    if (seconds == null) {
      missing = true;
      continue;
    }
    hours += (size.restante * seconds) / 3600;
  }
  if (missing && hours === 0) return null;
  return hours;
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

    const ultimaBaixa = new Map<number, string | null>();
    for (const row of baixaRows) {
      ultimaBaixa.set(fbNum(row.NUMERO_OS), fbDate(row.ULTIMA));
    }

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
      items: Map<number, ProducaoOpSize & { item: number }>;
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
      const produzida = fbNum(row.PRODUZIDA);
      const tam = fbStr(row.TAM) || '—';
      const cor = colors.get(fbNum(row.COR)) ?? '';
      const item = fbNum(row.NUM_ITEM);
      current.items.set(item, {
        item,
        tam,
        cor,
        quantidade,
        produzida,
        restante: Math.max(0, quantidade - produzida),
      });
      const existing = current.tamanhos.find((size) => size.tam === tam && size.cor === cor);
      if (existing) {
        existing.quantidade += quantidade;
        existing.produzida += produzida;
        existing.restante = Math.max(0, existing.quantidade - existing.produzida);
      } else {
        current.tamanhos.push({
          tam,
          cor,
          quantidade,
          produzida,
          restante: Math.max(0, quantidade - produzida),
        });
      }
    }

    const ops: ProducaoOp[] = [];
    for (const current of grouped.values()) {
      const quantidade = current.tamanhos.reduce((sum, item) => sum + item.quantidade, 0);
      const produzida = current.tamanhos.reduce((sum, item) => sum + item.produzida, 0);
      const restante = Math.max(0, quantidade - produzida);
      if (restante <= 0 && ![...current.items.keys()].some((item) => itemToMachine.has(item))) continue;

      const liveMachines = listMaquinas(
        [...current.items.keys()].map((item) => itemToMachine.get(item) ?? 0)
      );
      const maquina = liveMachines[0] ?? current.maquina;
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
        situacao: liveMachines.length ? 'maquina' : current.status >= 2 ? 'produzindo' : 'espera',
        data: current.data,
        prazo: current.prazo,
        quantidade,
        produzida,
        restante,
        horas_restantes: hoursForSizes(tempos, current.referencia, current.tamanhos),
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
      const opNum = [...grouped.values()].find((draft) => draft.items.has(item))?.pedido;
      if (opNum == null) continue;
      const list = pedidoMaquinas.get(opNum) ?? [];
      if (!list.includes(maquina)) list.push(maquina);
      pedidoMaquinas.set(opNum, list);
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
      };
      current.ops += 1;
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
      pedidoMap.set(key, current);
    }

    for (const pedido of pedidoMap.values()) {
      const machines = pedido.maquinas;
      const hours = pedido.horas_restantes;
      if (hours == null) continue;
      if (machines.length >= 1) {
        pedido.previsao = addWorkingHours(today, hours / machines.length, PRODUCAO_HOURS_PER_DAY);
        pedido.maquinas_livres_em = pedido.previsao;
      } else {
        pedido.previsao = addWorkingHours(today, hours, PRODUCAO_HOURS_PER_DAY);
      }
      pedido.atrasado = Boolean(pedido.prazo && pedido.prazo < today);
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
        inicio: meta?.inicio != null ? secondsToClock(meta.inicio) : null,
        operador: meta?.operador ?? '',
        processo: meta?.processo ?? '',
        previsao_pedido: pedido?.previsao ?? null,
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
