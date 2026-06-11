import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  writeBatch,
} from 'firebase/firestore';

import { db } from '../firebase';
import type {
  Dashboard,
  MonthlyReport,
  Movement,
  Part,
  PartStatus,
  Shift,
  StockReport,
} from '../types';
import { CATALOG_PARTS } from '../data/catalogo-seed';

const partsCol = collection(db, 'parts');
const withdrawalsCol = collection(db, 'withdrawals');

function partDocId(code: string) {
  return code;
}

export function partStatus(part: Pick<Part, 'quantity' | 'min_quantity'>): PartStatus {
  if (part.quantity === 0) return 'zerado';
  if (part.min_quantity > 0 && part.quantity < part.min_quantity) return 'baixo';
  return 'ok';
}

function mapPart(id: string, data: Record<string, unknown>): Part {
  return {
    id,
    code: String(data.code ?? id),
    name: String(data.name ?? ''),
    quantity: Number(data.quantity ?? 0),
    min_quantity: Number(data.min_quantity ?? 0),
    unit: String(data.unit ?? 'un'),
    updated_at: data.updated_at instanceof Timestamp
      ? data.updated_at.toDate().toISOString()
      : String(data.updated_at ?? new Date().toISOString()),
  };
}

function mapWithdrawal(id: string, data: Record<string, unknown>): Movement {
  return {
    id,
    part_id: String(data.part_id ?? ''),
    type: 'withdrawal',
    quantity: Number(data.quantity ?? 0),
    previous_qty: Number(data.previous_qty ?? 0),
    new_qty: Number(data.new_qty ?? 0),
    reason: null,
    shift: (data.shift as Shift) ?? null,
    withdrawn_by: (data.withdrawn_by as string) ?? null,
    requested_by: (data.requested_by as string) ?? null,
    notes: (data.notes as string) ?? null,
    created_at: data.created_at instanceof Timestamp
      ? data.created_at.toDate().toISOString()
      : String(data.created_at ?? new Date().toISOString()),
    part_code: (data.part_code as string) ?? undefined,
    part_name: (data.part_name as string) ?? undefined,
  };
}

function monthKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export async function ensureCatalogSeeded() {
  const snap = await getDocs(partsCol);
  if (!snap.empty) return;

  const batch = writeBatch(db);
  for (const item of CATALOG_PARTS) {
    const ref = doc(partsCol, partDocId(item.code));
    batch.set(ref, {
      code: item.code,
      name: item.name,
      quantity: item.quantity ?? 0,
      min_quantity: item.min_quantity ?? 10,
      unit: item.unit ?? 'un',
      updated_at: serverTimestamp(),
    });
  }
  await batch.commit();
}

async function getAllParts(): Promise<Part[]> {
  const snap = await getDocs(partsCol);
  return snap.docs
    .map((d) => mapPart(d.id, d.data()))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export const firestoreDb = {
  getParts: async (filters?: { q?: string; status?: PartStatus }) => {
    let rows = await getAllParts();
    const q = filters?.q?.trim().toLowerCase();
    if (q) {
      rows = rows.filter(
        (p) => p.code.toLowerCase().includes(q) || p.name.toLowerCase().includes(q)
      );
    }
    if (filters?.status) {
      rows = rows.filter((p) => partStatus(p) === filters.status);
    }
    return rows;
  },

  setQuantity: async (id: string, quantity: number) => {
    if (quantity < 0) throw new Error('Quantidade não pode ser negativa.');
    const ref = doc(partsCol, id);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error('Peça não encontrada.');
      tx.update(ref, { quantity, updated_at: serverTimestamp() });
    });
    const updated = await getDoc(ref);
    return mapPart(updated.id, updated.data()!);
  },

  withdraw: async (
    id: string,
    input: {
      quantity: number;
      shift: Shift;
      withdrawn_by: string;
      requested_by?: string;
      notes?: string;
    }
  ) => {
    const qty = Number(input.quantity);
    if (!qty || qty <= 0) throw new Error('Informe a quantidade retirada.');
    if (!input.withdrawn_by?.trim()) throw new Error('Informe quem retirou.');

    const partRef = doc(partsCol, id);
    const withdrawalRef = doc(withdrawalsCol);

    const result = await runTransaction(db, async (tx) => {
      const partSnap = await tx.get(partRef);
      if (!partSnap.exists()) throw new Error('Peça não encontrada.');
      const part = mapPart(partSnap.id, partSnap.data()!);
      const newQty = part.quantity - qty;
      if (newQty < 0) throw new Error('Quantidade maior que o estoque disponível.');

      tx.update(partRef, { quantity: newQty, updated_at: serverTimestamp() });
      tx.set(withdrawalRef, {
        part_id: id,
        part_code: part.code,
        part_name: part.name,
        type: 'withdrawal',
        quantity: qty,
        previous_qty: part.quantity,
        new_qty: newQty,
        shift: input.shift,
        withdrawn_by: input.withdrawn_by.trim(),
        requested_by: input.requested_by?.trim() || null,
        notes: input.notes?.trim() || null,
        created_at: serverTimestamp(),
      });

      return { part: { ...part, quantity: newQty }, withdrawalId: withdrawalRef.id };
    });

    const wSnap = await getDoc(doc(withdrawalsCol, result.withdrawalId));
    return {
      part: result.part,
      withdrawal: mapWithdrawal(wSnap.id, wSnap.data()!),
    };
  },

  getWithdrawals: async (shift?: Shift) => {
    const q = query(withdrawalsCol, orderBy('created_at', 'desc'));
    const snap = await getDocs(q);
    let rows = snap.docs.map((d) => mapWithdrawal(d.id, d.data()));
    if (shift) rows = rows.filter((r) => r.shift === shift);
    return rows.slice(0, 200);
  },

  updateWithdrawal: async (
    id: string,
    input: {
      quantity: number;
      shift: Shift;
      withdrawn_by: string;
      requested_by?: string;
      notes?: string;
    }
  ) => {
    const qty = Number(input.quantity);
    if (!qty || qty <= 0) throw new Error('Informe a quantidade retirada.');
    if (!input.withdrawn_by?.trim()) throw new Error('Informe quem retirou.');

    const withdrawalRef = doc(withdrawalsCol, id);

    const result = await runTransaction(db, async (tx) => {
      const wSnap = await tx.get(withdrawalRef);
      if (!wSnap.exists()) throw new Error('Retirada não encontrada.');
      const movement = mapWithdrawal(wSnap.id, wSnap.data()!);
      const partRef = doc(partsCol, movement.part_id);
      const partSnap = await tx.get(partRef);
      if (!partSnap.exists()) throw new Error('Peça não encontrada.');
      const part = mapPart(partSnap.id, partSnap.data()!);

      const newPartQty = part.quantity + movement.quantity - qty;
      if (newPartQty < 0) throw new Error('Quantidade maior que o estoque disponível.');

      tx.update(partRef, { quantity: newPartQty, updated_at: serverTimestamp() });
      tx.update(withdrawalRef, {
        quantity: qty,
        new_qty: newPartQty,
        shift: input.shift,
        withdrawn_by: input.withdrawn_by.trim(),
        requested_by: input.requested_by?.trim() || null,
        notes: input.notes?.trim() || null,
      });

      return { part: { ...part, quantity: newPartQty } };
    });

    const wSnap = await getDoc(withdrawalRef);
    return { part: result.part, movement: mapWithdrawal(wSnap.id, wSnap.data()!) };
  },

  deleteWithdrawal: async (id: string) => {
    const withdrawalRef = doc(withdrawalsCol, id);

    const result = await runTransaction(db, async (tx) => {
      const wSnap = await tx.get(withdrawalRef);
      if (!wSnap.exists()) throw new Error('Retirada não encontrada.');
      const movement = mapWithdrawal(wSnap.id, wSnap.data()!);
      const partRef = doc(partsCol, movement.part_id);
      const partSnap = await tx.get(partRef);
      if (!partSnap.exists()) throw new Error('Peça não encontrada.');
      const part = mapPart(partSnap.id, partSnap.data()!);
      const newQty = part.quantity + movement.quantity;

      tx.update(partRef, { quantity: newQty, updated_at: serverTimestamp() });
      tx.delete(withdrawalRef);

      return { part: { ...part, quantity: newQty }, deleted: movement };
    });

    return result;
  },

  getDashboard: async (): Promise<Dashboard> => {
    const parts = await getAllParts();
    const withdrawals = await firestoreDb.getWithdrawals();
    const lowStockParts = parts
      .filter((p) => partStatus(p) === 'baixo' || partStatus(p) === 'zerado')
      .map((p) => ({ ...p, status: partStatus(p) }))
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 10);

    return {
      total_parts: parts.length,
      low_stock: parts.filter((p) => partStatus(p) === 'baixo').length,
      out_of_stock: parts.filter((p) => partStatus(p) === 'zerado').length,
      lowStockParts,
      recentMovements: [],
      recentWithdrawals: withdrawals.slice(0, 10),
    };
  },

  getReport: async (): Promise<StockReport> => {
    const parts = (await getAllParts()).map((p) => ({ ...p, status: partStatus(p) }));
    const low = parts.filter((p) => p.status === 'baixo');
    const zero = parts.filter((p) => p.status === 'zerado');
    const withdrawals = await firestoreDb.getWithdrawals();

    return {
      generated_at: new Date().toISOString(),
      total_parts: parts.length,
      low_stock: low.length,
      out_of_stock: zero.length,
      parts,
      lowStockParts: low,
      outOfStockParts: zero,
      recentMovements: [],
      recentWithdrawals: withdrawals.slice(0, 50),
    };
  },

  getMonthlyReport: async (monthKeyStr: string): Promise<MonthlyReport> => {
    const withdrawals = (await firestoreDb.getWithdrawals()).filter(
      (w) => monthKey(w.created_at) === monthKeyStr
    );

    const SHIFT_ORDER: Shift[] = ['cedo', 'tarde', 'noite'];
    const byPartMap = new Map<string, MonthlyReport['by_part'][0]>();
    const byShiftMap = new Map<Shift, MonthlyReport['by_shift'][0]>();
    const byWithdrawnMap = new Map<string, MonthlyReport['by_withdrawn_by'][0]>();
    const byRequestedMap = new Map<string, MonthlyReport['by_requested_by'][0]>();

    let totalWithdrawn = 0;

    for (const w of withdrawals) {
      totalWithdrawn += w.quantity;
      const shift = w.shift ?? 'cedo';
      const partKey = w.part_id;

      if (!byPartMap.has(partKey)) {
        byPartMap.set(partKey, {
          part_id: partKey,
          part_code: w.part_code ?? partKey,
          part_name: w.part_name ?? '',
          unit: 'un',
          total_qty: 0,
          by_shift: { cedo: 0, tarde: 0, noite: 0 },
        });
      }
      const partRow = byPartMap.get(partKey)!;
      partRow.total_qty += w.quantity;
      partRow.by_shift[shift] += w.quantity;

      if (!byShiftMap.has(shift)) {
        byShiftMap.set(shift, { shift, total_qty: 0, records: 0, parts: [] });
      }
      const shiftRow = byShiftMap.get(shift)!;
      shiftRow.total_qty += w.quantity;
      shiftRow.records += 1;
      const existing = shiftRow.parts.find((p) => p.part_code === w.part_code);
      if (existing) existing.total_qty += w.quantity;
      else {
        shiftRow.parts.push({
          part_code: w.part_code ?? '',
          part_name: w.part_name ?? '',
          total_qty: w.quantity,
        });
      }

      const withdrawnName = w.withdrawn_by?.trim() || 'Não informado';
      if (!byWithdrawnMap.has(withdrawnName)) {
        byWithdrawnMap.set(withdrawnName, {
          name: withdrawnName,
          total_qty: 0,
          records: 0,
          by_shift: { cedo: 0, tarde: 0, noite: 0 },
        });
      }
      const wr = byWithdrawnMap.get(withdrawnName)!;
      wr.total_qty += w.quantity;
      wr.records += 1;
      wr.by_shift[shift] += w.quantity;

      const requestedName = w.requested_by?.trim() || 'Não informado';
      if (!byRequestedMap.has(requestedName)) {
        byRequestedMap.set(requestedName, {
          name: requestedName,
          total_qty: 0,
          records: 0,
          by_shift: { cedo: 0, tarde: 0, noite: 0 },
        });
      }
      const rq = byRequestedMap.get(requestedName)!;
      rq.total_qty += w.quantity;
      rq.records += 1;
      rq.by_shift[shift] += w.quantity;
    }

    const by_part = [...byPartMap.values()].sort(
      (a, b) => b.total_qty - a.total_qty || a.part_name.localeCompare(b.part_name, 'pt-BR')
    );

    const by_shift = SHIFT_ORDER.map((shift) => {
      const row = byShiftMap.get(shift);
      return {
        shift,
        total_qty: row?.total_qty ?? 0,
        records: row?.records ?? 0,
        parts: row ? [...row.parts].sort((a, b) => b.total_qty - a.total_qty) : [],
      };
    });

    const peak_shift =
      by_shift.reduce<(typeof by_shift)[0] | null>(
        (best, row) => (!best || row.total_qty > best.total_qty ? row : best),
        null
      )?.shift ?? null;

    const mapEmployees = (map: Map<string, MonthlyReport['by_withdrawn_by'][0]>) =>
      [...map.values()].sort((a, b) => b.total_qty - a.total_qty);

    const [year, month] = monthKeyStr.split('-').map(Number);
    const MONTH_NAMES = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];

    return {
      month: monthKeyStr,
      period_label: `${MONTH_NAMES[month - 1]}/${year}`,
      generated_at: new Date().toISOString(),
      total_withdrawn: totalWithdrawn,
      total_records: withdrawals.length,
      peak_shift,
      by_part,
      by_shift,
      by_withdrawn_by: mapEmployees(byWithdrawnMap),
      by_requested_by: mapEmployees(byRequestedMap),
      details: withdrawals,
    };
  },
};
