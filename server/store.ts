import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
const dataPath = path.join(dataDir, 'estoque.json');

export type MachineRow = {
  id: number;
  code: string;
  name: string;
  location: string | null;
  notes: string | null;
  created_at: string;
};

export type PartRow = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  quantity: number;
  min_quantity: number;
  unit: string;
  location: string | null;
  machine_id: number | null;
  supplier: string | null;
  unit_cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type MovementRow = {
  id: number;
  part_id: number;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
};

type DbState = {
  machines: MachineRow[];
  parts: PartRow[];
  movements: MovementRow[];
  nextMachineId: number;
  nextPartId: number;
  nextMovementId: number;
};

const emptyState = (): DbState => ({
  machines: [],
  parts: [],
  movements: [],
  nextMachineId: 1,
  nextPartId: 1,
  nextMovementId: 1,
});

let state: DbState = emptyState();

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function load() {
  ensureDataDir();
  if (!fs.existsSync(dataPath)) {
    state = emptyState();
    save();
    return;
  }
  state = { ...emptyState(), ...JSON.parse(fs.readFileSync(dataPath, 'utf8')) };
}

function save() {
  ensureDataDir();
  fs.writeFileSync(dataPath, JSON.stringify(state, null, 2), 'utf8');
}

load();

function now() {
  return new Date().toISOString();
}

export const store = {
  getMachines: () => [...state.machines].sort((a, b) => a.name.localeCompare(b.name)),
  getMachine: (id: number) => state.machines.find((m) => m.id === id),
  createMachine: (input: Omit<MachineRow, 'id' | 'created_at'>) => {
    if (state.machines.some((m) => m.code === input.code)) {
      throw new Error('DUPLICATE_MACHINE');
    }
    const row: MachineRow = { id: state.nextMachineId++, ...input, created_at: now() };
    state.machines.push(row);
    save();
    return row;
  },
  updateMachine: (id: number, input: Omit<MachineRow, 'id' | 'created_at'>) => {
    const idx = state.machines.findIndex((m) => m.id === id);
    if (idx < 0) return null;
    if (state.machines.some((m) => m.code === input.code && m.id !== id)) {
      throw new Error('DUPLICATE_MACHINE');
    }
    state.machines[idx] = { ...state.machines[idx], ...input };
    save();
    return state.machines[idx];
  },
  deleteMachine: (id: number) => {
    const before = state.machines.length;
    state.machines = state.machines.filter((m) => m.id !== id);
    state.parts = state.parts.map((p) => (p.machine_id === id ? { ...p, machine_id: null } : p));
    if (state.machines.length === before) return false;
    save();
    return true;
  },

  getParts: (filters?: { q?: string; machineId?: number; lowOnly?: boolean }) => {
    let rows = [...state.parts];
    const q = filters?.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) =>
          p.code.toLowerCase().includes(q) ||
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q) ||
          (p.supplier ?? '').toLowerCase().includes(q)
      );
    }
    if (filters?.machineId) {
      rows = rows.filter((p) => p.machine_id === filters.machineId);
    }
    if (filters?.lowOnly) {
      rows = rows.filter((p) => p.min_quantity > 0 && p.quantity <= p.min_quantity);
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  },
  getPart: (id: number) => state.parts.find((p) => p.id === id),
  createPart: (input: Omit<PartRow, 'id' | 'created_at' | 'updated_at'>) => {
    if (state.parts.some((p) => p.code === input.code)) {
      throw new Error('DUPLICATE_PART');
    }
    const ts = now();
    const row: PartRow = { id: state.nextPartId++, ...input, created_at: ts, updated_at: ts };
    state.parts.push(row);
    save();
    return row;
  },
  updatePart: (id: number, input: Partial<Omit<PartRow, 'id' | 'created_at' | 'updated_at' | 'quantity'>>) => {
    const idx = state.parts.findIndex((p) => p.id === id);
    if (idx < 0) return null;
    if (input.code && state.parts.some((p) => p.code === input.code && p.id !== id)) {
      throw new Error('DUPLICATE_PART');
    }
    state.parts[idx] = { ...state.parts[idx], ...input, updated_at: now() };
    save();
    return state.parts[idx];
  },
  deletePart: (id: number) => {
    const before = state.parts.length;
    state.parts = state.parts.filter((p) => p.id !== id);
    state.movements = state.movements.filter((m) => m.part_id !== id);
    if (state.parts.length === before) return false;
    save();
    return true;
  },

  getMovements: (partId?: number) => {
    let rows = [...state.movements];
    if (partId) rows = rows.filter((m) => m.part_id === partId);
    return rows.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  },
  createMovement: (input: {
    part_id: number;
    type: 'in' | 'out' | 'adjust';
    quantity: number;
    reason?: string | null;
    reference?: string | null;
  }) => {
    const part = state.parts.find((p) => p.id === input.part_id);
    if (!part) return null;

    let newQty = part.quantity;
    if (input.type === 'in') newQty += input.quantity;
    else if (input.type === 'out') newQty -= input.quantity;
    else newQty = input.quantity;

    if (newQty < 0) throw new Error('NEGATIVE_STOCK');

    const movement: MovementRow = {
      id: state.nextMovementId++,
      part_id: input.part_id,
      type: input.type,
      quantity: input.type === 'adjust' ? newQty : input.quantity,
      previous_qty: part.quantity,
      new_qty: newQty,
      reason: input.reason ?? null,
      reference: input.reference ?? null,
      created_at: now(),
    };

    part.quantity = newQty;
    part.updated_at = now();
    state.movements.push(movement);
    save();
    return { movement, part };
  },

  getDashboard: () => {
    const lowStockParts = state.parts
      .filter((p) => p.min_quantity > 0 && p.quantity <= p.min_quantity)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 8);
    const recentMovements = store.getMovements().slice(0, 10);

    return {
      total_parts: state.parts.length,
      total_machines: state.machines.length,
      low_stock: state.parts.filter((p) => p.min_quantity > 0 && p.quantity <= p.min_quantity).length,
      out_of_stock: state.parts.filter((p) => p.quantity === 0).length,
      stock_value: state.parts.reduce((sum, p) => sum + p.quantity * (p.unit_cost ?? 0), 0),
      lowStockParts,
      recentMovements,
    };
  },

  enrichPart: (part: PartRow) => {
    const machine = part.machine_id ? state.machines.find((m) => m.id === part.machine_id) : null;
    return {
      ...part,
      machine_code: machine?.code ?? null,
      machine_name: machine?.name ?? null,
    };
  },

  enrichMovement: (movement: MovementRow) => {
    const part = state.parts.find((p) => p.id === movement.part_id);
    return {
      ...movement,
      part_code: part?.code,
      part_name: part?.name,
    };
  },
};
