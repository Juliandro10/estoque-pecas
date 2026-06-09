export type Machine = {
  id: number;
  code: string;
  name: string;
  location: string | null;
  notes: string | null;
  created_at: string;
};

export type Part = {
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
  machine_code?: string | null;
  machine_name?: string | null;
};

export type Movement = {
  id: number;
  part_id: number;
  type: 'in' | 'out' | 'adjust';
  quantity: number;
  previous_qty: number;
  new_qty: number;
  reason: string | null;
  reference: string | null;
  created_at: string;
  part_code?: string;
  part_name?: string;
};

export type Dashboard = {
  total_parts: number;
  total_machines: number;
  low_stock: number;
  out_of_stock: number;
  stock_value: number;
  lowStockParts: Part[];
  recentMovements: Movement[];
};
