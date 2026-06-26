import type {
  M1BitmapCatalog,
  M1DensityResult,
  M1FabricLibrary,
  M1KnittSymResult,
  M1KnowledgeFile,
  M1Measurement,
  M1MeshResult,
  M1TimeBatchResult,
  M1TimeLookup,
  ModelCadastro,
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
    if (res.status === 413) {
      throw new Error('Arquivo grande demais. Reinicie o Iniciar.bat ou reduza a imagem.');
    }
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
  saveCadastroPdf: (payload: {
    reference: string;
    full_search?: boolean;
    model_folder?: string;
    cadastro: Pick<
      ModelCadastro,
      'reference' | 'name' | 'parts' | 'yarn_parts' | 'observations' | 'updated_at'
    >;
  }) =>
    localRequest<{ ok: boolean; path: string; file_name: string }>('/api/programs/cadastro-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  m1Density: (reference: string, fullSearch = false, partFile?: string) =>
    localRequest<M1DensityResult>(
      `/api/programs/m1-density?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}${partFile ? `&part=${encodeURIComponent(partFile)}` : ''}`
    ),
  m1Mesh: (reference: string, fullSearch = false, partFile?: string) =>
    localRequest<M1MeshResult>(
      `/api/programs/m1-mesh?ref=${encodeURIComponent(reference.trim())}${fullSearch ? '&full=1' : ''}${partFile ? `&part=${encodeURIComponent(partFile)}` : ''}`
    ),
  m1Symbols: () => localRequest<M1KnittSymResult>('/api/programs/m1-symbols'),
  m1FabricLib: () => localRequest<M1FabricLibrary>('/api/programs/m1-fabric-lib'),
  m1Bitmaps: () => localRequest<M1BitmapCatalog>('/api/programs/m1-bitmaps'),
  m1Knowledge: () => localRequest<M1KnowledgeFile>('/api/programs/m1-knowledge'),
  m1VisualUpload: async (payload: {
    stitch_id: string;
    slot: 'stitch' | 'icon' | 'malhas';
    file: File;
  }) => {
    const qs = new URLSearchParams({
      stitch_id: payload.stitch_id,
      slot: payload.slot,
      file_name: payload.file.name,
      mime_type: payload.file.type || 'application/octet-stream',
    });
    const res = await fetch(`/api/programs/m1-visual/upload?${qs.toString()}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: payload.file,
    });
    const body = (await res.json().catch(() => null)) as { error?: string; stitchType?: M1KnowledgeFile['stitchTypes'][number] } | null;
    if (!res.ok) {
      if (body?.error) throw new Error(body.error);
      if (res.status === 413) {
        throw new Error('Arquivo grande demais. Reinicie o Iniciar.bat ou reduza a imagem.');
      }
      throw new Error(`Erro ${res.status}`);
    }
    return body as { ok: boolean; stitchType: M1KnowledgeFile['stitchTypes'][number] };
  },
  m1StitchTypeUpsert: (payload: { id: string; code: string; name: string }) =>
    localRequest<{ ok: boolean; stitchType: M1KnowledgeFile['stitchTypes'][number] }>(
      '/api/programs/m1-stitch-types',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    ),
  saveM1Measurement: (payload: Record<string, unknown>) =>
    localRequest<{ ok: boolean; measurement: M1Measurement }>('/api/programs/m1-measurements', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  m1Similar: (params: {
    syntech_cod?: number;
    yarn_key?: string;
    cms?: string;
    gauge?: string;
    stitch?: string;
  }) => {
    const q = new URLSearchParams();
    if (params.syntech_cod != null) q.set('syntech_cod', String(params.syntech_cod));
    if (params.yarn_key) q.set('yarn_key', params.yarn_key);
    if (params.cms) q.set('cms', params.cms);
    if (params.gauge) q.set('gauge', params.gauge);
    if (params.stitch) q.set('stitch', params.stitch);
    return localRequest<{ items: M1Measurement[] }>(`/api/programs/m1-similar?${q.toString()}`);
  },
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

export function scannerSupportsM1Density(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 26 || health.features?.includes('m1-density') === true;
}

export function scannerSupportsM1Visual(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 26 || health.features?.includes('m1-visual') === true;
}

export function scannerSupportsM1Native(health: { version?: number; features?: string[] }) {
  return (health.version ?? 0) >= 29 || health.features?.includes('m1-fabric-lib') === true;
}

export function isLocalScannerAvailable() {
  return import.meta.env.DEV || window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}
