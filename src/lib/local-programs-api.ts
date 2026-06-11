import type {
  M1TimeBatchResult,
  M1TimeLookup,
  ProgramLookup,
  ProgramPartsResponse,
  SintralTimePart,
  SintralTimesResult,
  SinYarnsResult,
  SyntechPushResult,
  SyntechYarnCatalogFile,
} from '../types-programming';

async function localRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  const body = (await res.json().catch(() => null)) as { error?: string } | T | null;
  if (!res.ok) {
    const msg = (body as { error?: string } | null)?.error;
    if (msg) throw new Error(msg);
    if (res.status === 404) {
      throw new Error(
        'Serviço não encontrado. Feche e abra de novo o Iniciar.bat para atualizar o scanner local.'
      );
    }
    throw new Error(`Erro ${res.status}`);
  }
  return body as T;
}

export const localProgramsApi = {
  lookup: (reference: string, fullSearch = false, withParts = false, withTimes = false) =>
    localRequest<ProgramLookup>(
      `/api/programs/lookup?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}${withParts ? '&parts=1' : ''}${withTimes ? '&tempos=1' : ''}`
    ),
  parts: async (reference: string, fullSearch = false) => {
    try {
      return await localRequest<ProgramPartsResponse>(
        `/api/programs/parts?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}`
      );
    } catch (err) {
      const found = await localProgramsApi.lookup(reference, fullSearch, true);
      if (found.parts) {
        return {
          reference: found.reference,
          name: found.name,
          folder_path: found.folder_path,
          parts: found.parts,
        };
      }
      throw err;
    }
  },
  sintralTimes: (reference: string, fullSearch = false) =>
    localRequest<SintralTimesResult & { reference: string; folder_path: string; parts: SintralTimePart[] }>(
      `/api/programs/sintral-times?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}`
    ),
  sintralYarns: (reference: string, fullSearch = false) =>
    localRequest<SinYarnsResult & { reference: string; folder_path: string }>(
      `/api/programs/sintral-yarns?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}`
    ),
  m1Time: (partFileName: string, modelFolder?: string) =>
    localRequest<M1TimeLookup>(
      `/api/programs/m1-time?part=${encodeURIComponent(partFileName.trim())}${modelFolder ? `&folder=${encodeURIComponent(modelFolder)}` : ''}`
    ),
  m1Times: (reference: string, fullSearch = false) =>
    localRequest<M1TimeBatchResult>(
      `/api/programs/m1-times?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}`
    ),
  syntechPush: (payload: {
    reference: string;
    full_search?: boolean;
    model_folder?: string;
    parts: { label: string; file_name: string; time_mmss: string; weight_kg: string }[];
    consolidated_yarns?: {
      guide: number;
      letter: string;
      description: string;
      consumption: string;
      pct?: number;
      tipo_fio_codigo?: number;
    }[];
  }) =>
    localRequest<SyntechPushResult>('/api/programs/syntech-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  syntechFios: () => localRequest<SyntechYarnCatalogFile>('/api/programs/syntech-fios'),
  syncSyntechFios: () =>
    localRequest<SyntechYarnCatalogFile>('/api/programs/syntech-fios/sync', { method: 'POST' }),
  health: () =>
    localRequest<{
      ok: boolean;
      version?: number;
      stoll_tmp?: string;
      root: string;
      search_days: number;
      features?: string[];
    }>('/api/programs/health'),
};

export function scannerSupportsParts(health: { version?: number; stoll_tmp?: string }) {
  return (health.version ?? 0) >= 2 || Boolean(health.stoll_tmp);
}

export function scannerSupportsSintralTimes(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 17 || health.features?.includes('sintral-times') === true;
}

export function scannerSupportsSintralYarns(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 18 || health.features?.includes('sintral-yarns') === true;
}

export function scannerSupportsSyntechPush(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 21 || health.features?.includes('syntech-push') === true;
}

export function scannerSupportsSyntechFios(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 22 || health.features?.includes('syntech-fios') === true;
}

export function isLocalScannerAvailable() {
  return import.meta.env.DEV || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}
