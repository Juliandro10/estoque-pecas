import type { Dashboard, MonthlyReport, Movement, Part, PartStatus, Shift, StockReport } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<Dashboard>('/dashboard'),
  parts: {
    list: (params?: { q?: string; status?: PartStatus }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set('q', params.q);
      if (params?.status) search.set('status', params.status);
      const qs = search.toString();
      return request<Part[]>(`/parts${qs ? `?${qs}` : ''}`);
    },
    setQuantity: (id: number, quantity: number, reason?: string) =>
      request<Part>(`/parts/${id}/quantity`, {
        method: 'PUT',
        body: JSON.stringify({ quantity, reason }),
      }),
    withdraw: (
      id: number,
      data: {
        quantity: number;
        shift: Shift;
        withdrawn_by: string;
        requested_by?: string;
        notes?: string;
      }
    ) =>
      request<{ part: Part; withdrawal: Movement }>(`/parts/${id}/withdraw`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
  movements: () => request<Movement[]>('/movements'),
  withdrawals: {
    list: (shift?: Shift) =>
      request<Movement[]>(`/withdrawals${shift ? `?shift=${shift}` : ''}`),
    update: (
      id: number,
      data: {
        quantity: number;
        shift: Shift;
        withdrawn_by: string;
        requested_by?: string;
        notes?: string;
      }
    ) =>
      request<{ part: Part; movement: Movement }>(`/withdrawals/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remove: (id: number) =>
      request<{ part: Part; deleted: Movement }>(`/withdrawals/${id}`, { method: 'DELETE' }),
  },
  report: () => request<StockReport>('/report'),
  monthlyReport: (month: string) => request<MonthlyReport>(`/reports/monthly?month=${month}`),
};
