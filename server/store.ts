import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dataDir, 'estoque.json');

export type PartRow = {
  id: number;
  code: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  updated_at: string;
};

export type Shift = 'cedo' | 'tarde' | 'noite';

export type MovementRow = {
  id: number;
  part_id: number;
  type: 'adjust' | 'withdrawal';
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reason: string | null;
  shift: Shift | null;
  withdrawn_by: string | null;
  requested_by: string | null;
  machine: number | null;
  notes: string | null;
  created_at: string;
};

const MACHINE_MIN = 1;
const MACHINE_MAX = 15;

function parseMachine(value: unknown) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < MACHINE_MIN || n > MACHINE_MAX) throw new Error('INVALID_MACHINE');
  return n;
}

type DbState = {
  parts: PartRow[];
  movements: MovementRow[];
  nextPartId: number;
  nextMovementId: number;
};

const emptyState = (): DbState => ({
  parts: [],
  movements: [],
  nextPartId: 1,
  nextMovementId: 1,
});

let state: DbState = emptyState();

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(dataPath)) {
    state = emptyState();
    save();
    return;
  }
  const raw = { ...emptyState(), ...JSON.parse(fs.readFileSync(dataPath, 'utf8')) };
  state = {
    ...raw,
    movements: (raw.movements ?? []).map((m: MovementRow) => ({
      shift: null,
      withdrawn_by: null,
      requested_by: null,
      machine: null,
      notes: null,
      ...m,
    })),
  };
}

function save() {
  ensureDataDir();
  fs.writeFileSync(dataPath, JSON.stringify(state, null, 2), 'utf8');
}

load();

function now() {
  return new Date().toISOString();
}

export function partStatus(part: Pick<PartRow, 'quantity' | 'min_quantity'>) {
  if (part.quantity === 0) return 'zerado' as const;
  if (part.min_quantity > 0 && part.quantity < part.min_quantity) return 'baixo' as const;
  return 'ok' as const;
}

export const store = {
  getParts: (filters?: { q?: string; status?: 'baixo' | 'zerado' | 'ok' }) => {
    let rows = [...state.parts];
    const q = filters?.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    }
    if (filters?.status) {
      rows = rows.filter((p) => partStatus(p) === filters.status);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  },

  getPart: (id: number) => state.parts.find((p) => p.id === id),

  upsertPartFromCatalog: (input: {
    code: string;
    name: string;
    quantity?: number;
    min_quantity?: number;
    unit?: string;
  }) => {
    const existing = state.parts.find((p) => p.code === input.code);
    if (existing) {
      existing.name = input.name;
      existing.min_quantity = Number(input.min_quantity ?? existing.min_quantity);
      existing.unit = input.unit?.trim() || existing.unit;
      existing.updated_at = now();
      save();
      return { row: existing, created: false };
    }
    const row: PartRow = {
      id: state.nextPartId++,
      code: input.code.trim(),
      name: input.name.trim(),
      quantity: Number(input.quantity ?? 0),
      min_quantity: Number(input.min_quantity ?? 0),
      unit: input.unit?.trim() || 'un',
      updated_at: now(),
    };
    state.parts.push(row);
    save();
    return { row, created: true };
  },

  setQuantity: (id: number, quantity: number, reason?: string) => {
    const part = state.parts.find((p) => p.id === id);
    if (!part) return null;
    if (quantity < 0) throw new Error('NEGATIVE_STOCK');

    const movement: MovementRow = {
      id: state.nextMovementId++,
      part_id: id,
      type: 'adjust',
      quantity,
      previous_qty: part.quantity,
      new_qty: quantity,
      reason: reason?.trim() || null,
      shift: null,
      withdrawn_by: null,
      requested_by: null,
      machine: null,
      notes: null,
      created_at: now(),
    };

    part.quantity = quantity;
    part.updated_at = now();
    state.movements.push(movement);
    save();
    return { part, movement };
  },

  withdraw: (
    id: number,
    input: {
      quantity: number;
      shift: Shift;
      withdrawn_by: string;
      machine: number;
      requested_by?: string;
      notes?: string;
    }
  ) => {
    const part = state.parts.find((p) => p.id === id);
    if (!part) return null;

    const qty = Number(input.quantity);
    if (!qty || qty <= 0) throw new Error('INVALID_QUANTITY');
    if (!input.withdrawn_by?.trim()) throw new Error('MISSING_WITHDRAWN_BY');
    if (!['cedo', 'tarde', 'noite'].includes(input.shift)) throw new Error('INVALID_SHIFT');
    const machine = parseMachine(input.machine);

    const newQty = part.quantity - qty;
    if (newQty < 0) throw new Error('INSUFFICIENT_STOCK');

    const movement: MovementRow = {
      id: state.nextMovementId++,
      part_id: id,
      type: 'withdrawal',
      quantity: qty,
      previous_qty: part.quantity,
      new_qty: newQty,
      reason: null,
      shift: input.shift,
      withdrawn_by: input.withdrawn_by.trim(),
      requested_by: input.requested_by?.trim() || null,
      machine,
      notes: input.notes?.trim() || null,
      created_at: now(),
    };

    part.quantity = newQty;
    part.updated_at = now();
    state.movements.push(movement);
    save();
    return { part, movement };
  },

  enrichMovement: (m: MovementRow) => {
    const part = state.parts.find((p) => p.id === m.part_id);
    return { ...m, part_code: part?.code, part_name: part?.name };
  },

  getMovements: (limit = 50) =>
    [...state.movements]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map((m) => store.enrichMovement(m)),

  getWithdrawal: (id: number) => {
    const movement = state.movements.find((m) => m.id === id && m.type === 'withdrawal');
    return movement ? store.enrichMovement(movement) : null;
  },

  getWithdrawals: (filters?: { shift?: Shift; limit?: number }) => {
    let rows = state.movements.filter((m) => m.type === 'withdrawal');
    if (filters?.shift) rows = rows.filter((m) => m.shift === filters.shift);
    return rows
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, filters?.limit ?? 200)
      .map((m) => store.enrichMovement(m));
  },

  updateWithdrawal: (
    id: number,
    input: {
      quantity: number;
      shift: Shift;
      withdrawn_by: string;
      machine: number;
      requested_by?: string;
      notes?: string;
    }
  ) => {
    const idx = state.movements.findIndex((m) => m.id === id && m.type === 'withdrawal');
    if (idx < 0) return null;

    const movement = state.movements[idx];
    const part = state.parts.find((p) => p.id === movement.part_id);
    if (!part) return null;

    const qty = Number(input.quantity);
    if (!qty || qty <= 0) throw new Error('INVALID_QUANTITY');
    if (!input.withdrawn_by?.trim()) throw new Error('MISSING_WITHDRAWN_BY');
    if (!['cedo', 'tarde', 'noite'].includes(input.shift)) throw new Error('INVALID_SHIFT');
    const machine = parseMachine(input.machine);

    const newPartQty = part.quantity + movement.quantity - qty;
    if (newPartQty < 0) throw new Error('INSUFFICIENT_STOCK');

    part.quantity = newPartQty;
    part.updated_at = now();
    state.movements[idx] = {
      ...movement,
      quantity: qty,
      new_qty: newPartQty,
      shift: input.shift,
      withdrawn_by: input.withdrawn_by.trim(),
      requested_by: input.requested_by?.trim() || null,
      machine,
      notes: input.notes?.trim() || null,
    };
    save();
    return { part, movement: store.enrichMovement(state.movements[idx]) };
  },

  deleteWithdrawal: (id: number) => {
    const idx = state.movements.findIndex((m) => m.id === id && m.type === 'withdrawal');
    if (idx < 0) return null;

    const movement = state.movements[idx];
    const part = state.parts.find((p) => p.id === movement.part_id);
    if (!part) return null;

    part.quantity += movement.quantity;
    part.updated_at = now();
    state.movements.splice(idx, 1);
    save();
    return { part, deleted: store.enrichMovement(movement) };
  },

  getReport: () => {
    const parts = store.getParts().map((p) => ({ ...p, status: partStatus(p) }));
    const low = parts.filter((p) => p.status === 'baixo');
    const zero = parts.filter((p) => p.status === 'zerado');
    return {
      generated_at: now(),
      total_parts: parts.length,
      low_stock: low.length,
      out_of_stock: zero.length,
      parts,
      lowStockParts: low,
      outOfStockParts: zero,
      recentMovements: store.getMovements(20),
      recentWithdrawals: store.getWithdrawals({ limit: 50 }),
    };
  },

  getDashboard: () => {
    const parts = state.parts;
    return {
      total_parts: parts.length,
      low_stock: parts.filter((p) => partStatus(p) === 'baixo').length,
      out_of_stock: parts.filter((p) => partStatus(p) === 'zerado').length,
      lowStockParts: store
        .getParts({ status: 'baixo' })
        .concat(store.getParts({ status: 'zerado' }))
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 10)
        .map((p) => ({ ...p, status: partStatus(p) })),
      recentMovements: store.getMovements(10),
      recentWithdrawals: store.getWithdrawals({ limit: 10 }),
    };
  },
};
