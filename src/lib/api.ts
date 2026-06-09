import type { Dashboard, Machine, Movement, Part } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Erro ${res.status}`);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<Dashboard>('/dashboard'),
  machines: {
    list: () => request<Machine[]>('/machines'),
    create: (data: Partial<Machine>) =>
      request<Machine>('/machines', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Machine>) =>
      request<Machine>(`/machines/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/machines/${id}`, { method: 'DELETE' }),
  },
  parts: {
    list: (params?: { q?: string; machineId?: number; lowOnly?: boolean }) => {
      const search = new URLSearchParams();
      if (params?.q) search.set('q', params.q);
      if (params?.machineId) search.set('machineId', String(params.machineId));
      if (params?.lowOnly) search.set('lowOnly', '1');
      const qs = search.toString();
      return request<Part[]>(`/parts${qs ? `?${qs}` : ''}`);
    },
    get: (id: number) => request<Part>(`/parts/${id}`),
    create: (data: Partial<Part>) =>
      request<Part>('/parts', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Part>) =>
      request<Part>(`/parts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    remove: (id: number) => request<void>(`/parts/${id}`, { method: 'DELETE' }),
  },
  movements: {
    list: (partId?: number) =>
      request<Movement[]>(`/movements${partId ? `?partId=${partId}` : ''}`),
    create: (data: {
      part_id: number;
      type: 'in' | 'out' | 'adjust';
      quantity: number;
      reason?: string;
      reference?: string;
    }) =>
      request<{ movement: Movement; part: Part }>('/movements', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
  },
};
