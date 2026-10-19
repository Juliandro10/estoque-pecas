export type M1EditorModelId = 'composer' | 'grok' | 'local';
export type M1EditorEffort = 'low' | 'medium' | 'high' | 'xhigh';
export type M1EditorContext = '256k' | '500k';

export type M1EditorModelChoice = {
  id: M1EditorModelId;
  fast: boolean;
  effort: M1EditorEffort;
  context: M1EditorContext;
};

export const DEFAULT_M1_EDITOR_MODEL: M1EditorModelChoice = {
  id: 'composer',
  fast: true,
  effort: 'high',
  context: '256k',
};

export const M1_EDITOR_MODELS: { id: M1EditorModelId; label: string }[] = [
  { id: 'composer', label: 'Composer' },
  { id: 'grok', label: 'Grok' },
  { id: 'local', label: 'Local' },
];

export const LOCAL_EDITOR_MODEL = 'qwen3:30b-a3b';
export const LOCAL_EDITOR_FALLBACK_MODEL = 'qwen2.5:7b';
export const DEFAULT_OLLAMA_URL = 'http://127.0.0.1:11434';

export type M1EditorSaida = {
  largura: number;
  altura: number;
  cores: number;
};

export const DEFAULT_M1_EDITOR_SAIDA: M1EditorSaida = {
  largura: 320,
  altura: 240,
  cores: 4,
};

export function normalizeM1EditorSaida(value: unknown): M1EditorSaida {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const largura = clampInt(row.largura, 16, 2000, DEFAULT_M1_EDITOR_SAIDA.largura);
  const altura = clampInt(row.altura, 16, 2000, DEFAULT_M1_EDITOR_SAIDA.altura);
  const cores = clampInt(row.cores, 2, 8, DEFAULT_M1_EDITOR_SAIDA.cores);
  return { largura, altura, cores };
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export const M1_EDITOR_EFFORTS: { id: M1EditorEffort; label: string }[] = [
  { id: 'low', label: 'Baixo' },
  { id: 'medium', label: 'Médio' },
  { id: 'high', label: 'Alto' },
  { id: 'xhigh', label: 'Extra alto' },
];

export const M1_EDITOR_CONTEXTS: M1EditorContext[] = ['256k'];

const EFFORTS = new Set<string>(M1_EDITOR_EFFORTS.map((row) => row.id));

export function normalizeM1EditorModel(value: unknown): M1EditorModelChoice {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const effort = typeof row.effort === 'string' && EFFORTS.has(row.effort) ? (row.effort as M1EditorEffort) : DEFAULT_M1_EDITOR_MODEL.effort;
  return {
    id: row.id === 'grok' || row.id === 'local' ? row.id : 'composer',
    fast: typeof row.fast === 'boolean' ? row.fast : DEFAULT_M1_EDITOR_MODEL.fast,
    effort,
    context: '256k',
  };
}

export function m1EditorSdkModel(value: unknown) {
  const choice = normalizeM1EditorModel(value);
  if (choice.id === 'grok') {
    return {
      id: 'grok-4.7',
      params: [
        { id: 'context', value: '256k' },
        { id: 'reasoning_effort', value: choice.effort },
        { id: 'fast', value: choice.fast ? 'true' : 'false' },
      ],
    };
  }
  return {
    id: 'composer-2.5',
    params: [{ id: 'fast', value: choice.fast ? 'true' : 'false' }],
  };
}
