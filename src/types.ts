export type PartStatus = 'ok' | 'baixo' | 'zerado';
export type Shift = 'cedo' | 'tarde' | 'noite';

export const SHIFT_LABELS: Record<Shift, string> = {
  cedo: 'Cedo',
  tarde: 'Tarde',
  noite: 'Noite',
};

export type Part = {
  id: string;
  code: string;
  name: string;
  quantity: number;
  min_quantity: number;
  unit: string;
  updated_at: string;
  status?: PartStatus;
};

export type Movement = {
  id: string;
  part_id: string;
  type: 'withdrawal';
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reason: string | null;
  shift: Shift | null;
  withdrawn_by: string | null;
  requested_by: string | null;
  notes: string | null;
  created_at: string;
  part_code?: string;
  part_name?: string;
};

export type StockReport = {
  generated_at: string;
  total_parts: number;
  low_stock: number;
  out_of_stock: number;
  parts: Part[];
  lowStockParts: Part[];
  outOfStockParts: Part[];
  recentMovements: Movement[];
  recentWithdrawals: Movement[];
};

export type Dashboard = {
  total_parts: number;
  low_stock: number;
  out_of_stock: number;
  lowStockParts: Part[];
  recentMovements: Movement[];
  recentWithdrawals: Movement[];
};

export type MonthlyPartTotal = {
  part_id: string;
  part_code: string;
  part_name: string;
  unit: string;
  total_qty: number;
  by_shift: Record<Shift, number>;
};

export type MonthlyShiftTotal = {
  shift: Shift;
  total_qty: number;
  records: number;
  parts: Array<{ part_code: string; part_name: string; total_qty: number }>;
};

export type MonthlyEmployeeTotal = {
  name: string;
  total_qty: number;
  records: number;
  by_shift: Record<Shift, number>;
};

export type MonthlyReport = {
  month: string;
  period_label: string;
  generated_at: string;
  total_withdrawn: number;
  total_records: number;
  peak_shift: Shift | null;
  by_part: MonthlyPartTotal[];
  by_shift: MonthlyShiftTotal[];
  by_withdrawn_by: MonthlyEmployeeTotal[];
  by_requested_by: MonthlyEmployeeTotal[];
  details: Movement[];
};
