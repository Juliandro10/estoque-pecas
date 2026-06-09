import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const catalogPath = path.join(__dirname, '..', 'data', 'catalogo.json');

export type CatalogMachine = {
  code: string;
  name: string;
  location?: string | null;
  notes?: string | null;
};

export type CatalogPart = {
  code: string;
  name: string;
  description?: string | null;
  quantity?: number;
  min_quantity?: number;
  unit?: string;
  location?: string | null;
  machine_code?: string | null;
  supplier?: string | null;
  unit_cost?: number | null;
  notes?: string | null;
};

export type CatalogFile = {
  machines?: CatalogMachine[];
  parts?: CatalogPart[];
};

export function readCatalogFile(filePath = catalogPath): CatalogFile {
  if (!fs.existsSync(filePath)) {
    return { machines: [], parts: [] };
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as CatalogFile;
}

export function importCatalog(options?: { preserveQuantity?: boolean; filePath?: string }) {
  const preserveQuantity = options?.preserveQuantity ?? true;
  const catalog = readCatalogFile(options?.filePath);
  const machines = catalog.machines ?? [];
  const parts = catalog.parts ?? [];

  let machinesAdded = 0;
  let machinesUpdated = 0;
  let partsAdded = 0;
  let partsUpdated = 0;

  const machineIdByCode = new Map<string, number>();

  for (const existing of store.getMachines()) {
    machineIdByCode.set(existing.code, existing.id);
  }

  for (const item of machines) {
    const code = item.code?.trim();
    const name = item.name?.trim();
    if (!code || !name) continue;

    const payload = {
      code,
      name,
      location: item.location?.trim() || null,
      notes: item.notes?.trim() || null,
    };

    const existingId = machineIdByCode.get(code);
    if (existingId) {
      store.updateMachine(existingId, payload);
      machinesUpdated += 1;
    } else {
      const created = store.createMachine(payload);
      machineIdByCode.set(code, created.id);
      machinesAdded += 1;
    }
  }

  for (const item of parts) {
    const code = item.code?.trim();
    const name = item.name?.trim();
    if (!code || !name) continue;

    const machineCode = item.machine_code?.trim();
    const machine_id = machineCode ? (machineIdByCode.get(machineCode) ?? null) : null;

    const existing = store.getParts().find((p) => p.code === code);
    if (existing) {
      store.updatePart(existing.id, {
        code,
        name,
        description: item.description?.trim() || null,
        min_quantity: Number(item.min_quantity ?? existing.min_quantity ?? 0),
        unit: item.unit?.trim() || existing.unit || 'un',
        location: item.location?.trim() || null,
        machine_id,
        supplier: item.supplier?.trim() || null,
        unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
        notes: item.notes?.trim() || null,
      });
      partsUpdated += 1;
      continue;
    }

    store.createPart({
      code,
      name,
      description: item.description?.trim() || null,
      quantity: preserveQuantity ? Number(item.quantity ?? 0) : Number(item.quantity ?? 0),
      min_quantity: Number(item.min_quantity ?? 0),
      unit: item.unit?.trim() || 'un',
      location: item.location?.trim() || null,
      machine_id,
      supplier: item.supplier?.trim() || null,
      unit_cost: item.unit_cost != null ? Number(item.unit_cost) : null,
      notes: item.notes?.trim() || null,
    });
    partsAdded += 1;
  }

  return {
    machinesAdded,
    machinesUpdated,
    partsAdded,
    partsUpdated,
    totalMachines: machines.length,
    totalParts: parts.length,
  };
}
