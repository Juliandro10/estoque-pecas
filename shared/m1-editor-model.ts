export type M1EditorModelId = 'composer' | 'grok';
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
];

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
    id: row.id === 'grok' ? 'grok' : 'composer',
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
