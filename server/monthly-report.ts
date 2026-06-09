import { store, type Shift } from './store.js';

const SHIFT_ORDER: Shift[] = ['cedo', 'tarde', 'noite'];

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function previousMonthKey() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return formatMonthKey(d);
}

export function formatMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(monthKey: string) {
  const [year, month] = monthKey.split('-').map(Number);
  if (!year || !month) return monthKey;
  return `${MONTH_NAMES[month - 1]}/${year}`;
}

function movementMonthKey(iso: string) {
  const d = new Date(iso);
  return formatMonthKey(d);
}

function emptyShiftMap(): Record<Shift, number> {
  return { cedo: 0, tarde: 0, noite: 0 };
}

export function getMonthlyReport(monthKey: string) {
  const withdrawals = store
    .getWithdrawals({ limit: 10000 })
    .filter((w) => movementMonthKey(w.created_at) === monthKey);

  const byPartMap = new Map<
    number,
    {
      part_id: number;
      part_code: string;
      part_name: string;
      unit: string;
      total_qty: number;
      by_shift: Record<Shift, number>;
    }
  >();

  const byShiftMap = new Map<
    Shift,
    { total_qty: number; records: number; parts: Map<string, { part_code: string; part_name: string; total_qty: number }> }
  >();

  const byWithdrawnMap = new Map<string, { total_qty: number; records: number; by_shift: Record<Shift, number> }>();
  const byRequestedMap = new Map<string, { total_qty: number; records: number; by_shift: Record<Shift, number> }>();

  let totalWithdrawn = 0;

  for (const w of withdrawals) {
    totalWithdrawn += w.quantity;
    const shift = w.shift ?? 'cedo';
    const part = store.getPart(w.part_id);

    if (!byPartMap.has(w.part_id)) {
      byPartMap.set(w.part_id, {
        part_id: w.part_id,
        part_code: w.part_code ?? part?.code ?? '—',
        part_name: w.part_name ?? part?.name ?? '—',
        unit: part?.unit ?? 'un',
        total_qty: 0,
        by_shift: emptyShiftMap(),
      });
    }
    const partRow = byPartMap.get(w.part_id)!;
    partRow.total_qty += w.quantity;
    partRow.by_shift[shift] += w.quantity;

    if (!byShiftMap.has(shift)) {
      byShiftMap.set(shift, { total_qty: 0, records: 0, parts: new Map() });
    }
    const shiftRow = byShiftMap.get(shift)!;
    shiftRow.total_qty += w.quantity;
    shiftRow.records += 1;
    const partKey = String(w.part_id);
    if (!shiftRow.parts.has(partKey)) {
      shiftRow.parts.set(partKey, {
        part_code: partRow.part_code,
        part_name: partRow.part_name,
        total_qty: 0,
      });
    }
    shiftRow.parts.get(partKey)!.total_qty += w.quantity;

    const withdrawnName = w.withdrawn_by?.trim() || 'Não informado';
    if (!byWithdrawnMap.has(withdrawnName)) {
      byWithdrawnMap.set(withdrawnName, { total_qty: 0, records: 0, by_shift: emptyShiftMap() });
    }
    const withdrawnRow = byWithdrawnMap.get(withdrawnName)!;
    withdrawnRow.total_qty += w.quantity;
    withdrawnRow.records += 1;
    withdrawnRow.by_shift[shift] += w.quantity;

    const requestedName = w.requested_by?.trim() || 'Não informado';
    if (!byRequestedMap.has(requestedName)) {
      byRequestedMap.set(requestedName, { total_qty: 0, records: 0, by_shift: emptyShiftMap() });
    }
    const requestedRow = byRequestedMap.get(requestedName)!;
    requestedRow.total_qty += w.quantity;
    requestedRow.records += 1;
    requestedRow.by_shift[shift] += w.quantity;
  }

  const by_part = [...byPartMap.values()].sort((a, b) => b.total_qty - a.total_qty || a.part_name.localeCompare(b.part_name, 'pt-BR'));

  const by_shift = SHIFT_ORDER.map((shift) => {
    const row = byShiftMap.get(shift);
    return {
      shift,
      total_qty: row?.total_qty ?? 0,
      records: row?.records ?? 0,
      parts: row
        ? [...row.parts.values()].sort((a, b) => b.total_qty - a.total_qty)
        : [],
    };
  });

  const peak_shift =
    by_shift.reduce<(typeof by_shift)[0] | null>(
      (best, row) => (!best || row.total_qty > best.total_qty ? row : best),
      null
    )?.shift ?? null;

  const mapEmployees = (map: Map<string, { total_qty: number; records: number; by_shift: Record<Shift, number> }>) =>
    [...map.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.total_qty - a.total_qty || a.name.localeCompare(b.name, 'pt-BR'));

  return {
    month: monthKey,
    period_label: monthLabel(monthKey),
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
}
