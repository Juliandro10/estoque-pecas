import type { MonthlyMachineTotal, MonthlyReport } from '../types';

export function isNeedlePart(part_code?: string, part_name?: string) {
  const code = (part_code ?? '').toUpperCase();
  const name = (part_name ?? '').toLowerCase();
  return code.startsWith('AG-') || name.includes('agulha');
}

export function needleQty(row: MonthlyMachineTotal) {
  return row.parts
    .filter((p) => isNeedlePart(p.part_code, p.part_name))
    .reduce((sum, p) => sum + p.total_qty, 0);
}

export function sortedByMachineNeedles(rows: MonthlyMachineTotal[]) {
  return [...rows].sort((a, b) => {
    const diff = needleQty(b) - needleQty(a);
    if (diff !== 0) return diff;
    return b.total_qty - a.total_qty || a.machine - b.machine;
  });
}

export function peakNeedleMachine(rows: MonthlyMachineTotal[]) {
  const sorted = sortedByMachineNeedles(rows);
  if (!sorted.length) return null;
  const qty = needleQty(sorted[0]);
  if (qty <= 0) return null;
  return { machine: sorted[0].machine, qty };
}

export function withdrawalsMissingMachine(report: MonthlyReport) {
  return report.details.filter((w) => w.machine == null).length;
}
