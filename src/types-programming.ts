export const PROGRAM_VALUE = 150;

export type WorkType = 'extra' | 'normal';

export type JobKind = 'novo' | 'ajuste' | 'graduacao' | 'outro';

export const JOB_KIND_LABELS: Record<JobKind, string> = {
  novo: 'Desenvolvimento novo',
  ajuste: 'Ajuste',
  graduacao: 'Graduação de tamanho',
  outro: 'Outro',
};

export const JOB_KIND_OPTIONS: { value: JobKind; label: string }[] = (
  Object.entries(JOB_KIND_LABELS) as [JobKind, string][]
).map(([value, label]) => ({ value, label }));

export function formatJobKindLabel(kind: JobKind | null, note?: string | null) {
  if (!kind) return '—';
  if (kind === 'outro') {
    const text = note?.trim();
    return text ? `Outro: ${text}` : 'Outro';
  }
  return JOB_KIND_LABELS[kind];
}

export type SintralTimePart = {
  label: string;
  file_name: string;
  ok: boolean;
  time_mmss?: string;
  captured_at?: string;
  error?: string;
};

export type SintralTimesResult = {
  parts: SintralTimePart[];
  filled: number;
  total: number;
};

export type ProgramMachineInfo = {
  cms: string;
  gauge: string;
  label: string;
  syntech_maquina: number | null;
};

export type ProgramLookup = {
  reference: string;
  name: string;
  date: string;
  folder_path: string;
  searched_full: boolean;
  search_days: number | null;
  parts?: ProgramPartLookup[];
  times?: SintralTimesResult;
  machine?: ProgramMachineInfo | null;
};

export type ProgramPartLookup = {
  key: string;
  label: string;
  file_name: string;
};

export type M1TimeLookup = {
  time_mmss: string;
  seconds: number;
  source: 'cfgx' | 'xml' | 'mdv';
  part_base: string;
  files: {
    cfgx?: string;
    xml?: string;
    simx?: string;
    setx?: string;
    sin?: string;
  };
};

export type M1TimeBatchPart = {
  label: string;
  file_name: string;
  ok: boolean;
  time_mmss?: string;
  source?: 'cfgx' | 'xml' | 'mdv';
  error?: string;
};

export type M1TimeBatchResult = {
  reference: string;
  folder_path: string;
  parts: M1TimeBatchPart[];
  filled: number;
  total: number;
};

export type ProgramPartsResponse = {
  reference: string;
  name: string;
  folder_path: string;
  parts: ProgramPartLookup[];
};

export type ProgramEntry = {
  id: string;
  reference: string;
  name: string;
  job_kind: JobKind | null;
  job_kind_note: string | null;
  start_date: string;
  end_date: string;
  value: number;
  month: string;
  work_type: WorkType;
  created_at: string;
};

export type ProgramWeekGroup = {
  label: string;
  start: string;
  end: string;
  entries: ProgramEntry[];
  subtotal: number;
};

export type ProgramMonthlyReport = {
  month: string;
  period_label: string;
  generated_at: string;
  work_type: WorkType;
  weeks: ProgramWeekGroup[];
  total_programs: number;
  total_value: number;
};

export type CadastroPart = {
  key: string;
  label: string;
  file_name: string;
  time_mmss: string;
  weight_kg: string;
};

export type CadastroYarnGuide = {
  guide: number;
  letter: string;
  description: string;
  side: 'left' | 'right';
  pct?: number;
  consumption: string;
};

export type CadastroYarnPart = {
  key: string;
  label: string;
  file_name: string;
  guides: CadastroYarnGuide[];
};

export type ConsolidatedYarnRow = {
  guide: number;
  letter: string;
  description: string;
  pct: number;
  consumption: string;
  parts: string[];
  tipo_fio_codigo?: number | null;
  tipo_fio_nome?: string | null;
  cor?: string | null;
  codigo_ok?: boolean;
  cor_ok?: boolean;
};

export type SyntechYarnType = {
  codigo: number;
  tipo: string;
  cores: string[];
};

export type SyntechYarnCatalogFile = {
  updated_at: string;
  source: string;
  types: SyntechYarnType[];
};

export type SinYarnPartResult = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  sin_file?: string;
  simx_file?: string;
  ygc?: string;
  ydf?: number;
  guides: Omit<CadastroYarnGuide, 'consumption'>[];
  simx_ok?: boolean;
  error?: string;
  simx_error?: string;
};

export type SinYarnsResult = {
  parts: SinYarnPartResult[];
  filled: number;
  total: number;
  machine?: ProgramMachineInfo | null;
};

export type SyntechPushResult = {
  ok: boolean;
  reference: string;
  product_name?: string;
  tempo_rows: number;
  mat_prima_rows: number;
  maquina?: number;
  maquina_cms?: string;
  maquina_gauge?: string;
  programa?: string;
  guia_fio_rows: number;
  partes_prod_rows: number;
  bicos_maquina_rows: number;
  warnings: string[];
};

export type ModelCadastro = {
  reference: string;
  name: string;
  parts: CadastroPart[];
  yarn_parts: CadastroYarnPart[];
  /** @deprecated legado — use yarn_parts */
  yarn_notes: string;
  observations: string;
  updated_at: string;
};

export type M1NpRow = {
  np: number;
  value: number;
  label?: string;
  comment?: string;
};

export type M1DensityPart = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  error?: string;
  machine?: ProgramMachineInfo;
  sizes?: {
    wales: number | null;
    courses: number | null;
    wales_source?: string;
    courses_source?: string;
    machine_bed?: number | null;
    jac_lines?: number;
    sintral_cursos?: number | null;
    knitting_left?: number | null;
    knitting_right?: number | null;
    fixed_courses?: number | null;
    courses_breakdown?: string | null;
    sim_rows?: number | null;
  };
  regulation?: {
    primary_source: 'setx' | 'sin' | null;
    sin_nps: M1NpRow[];
    setx_nps: M1NpRow[];
    setx_msec?: { key: string; value: number; comment: string }[];
    sin_npj?: { front?: string; rear?: string };
    ydf?: number;
    ygc?: string;
    mseci?: number;
  };
  yarns?: {
    guide: number;
    letter: string;
    description: string;
    pct?: number;
  }[];
  files?: {
    sin?: string;
    setx?: string;
    jac?: string;
    simx?: string;
  };
};

export type M1DensityResult = {
  reference: string;
  folder_path: string;
  parts: M1DensityPart[];
  filled: number;
  total: number;
  machine?: ProgramMachineInfo | null;
  part?: M1DensityPart;
};

export type M1StitchType = {
  id: string;
  code: string;
  name: string;
  visual?: {
    stitch?: string;
    icon?: string;
    malhas?: string;
  };
};

export type M1MeasurementYarn = {
  bico: number;
  sinDescription: string;
  sinDescriptionKey: string;
  syntechCod?: number | null;
  syntechDesc?: string | null;
  pct?: number | null;
  letter: string;
};

export type M1Measurement = {
  id: string;
  createdAt: string;
  updatedAt: string;
  reference: string;
  programFolder: string;
  partBase: string;
  partLabel: string;
  machine: ProgramMachineInfo;
  swatch: { widthCm: number; heightCm: number; fabricState: 'raw' };
  programCounts: { wales: number; courses: number; source: string };
  density: { walesPer10cm: number; coursesPer10cm: number };
  regulation: {
    primarySource: 'setx' | 'sin';
    sinNps: M1NpRow[];
    setxNps: M1NpRow[];
    ydf?: number;
    ygc?: string;
    mseci?: number;
  };
  stitchTypeId?: string;
  stitchTypeCode?: string;
  yarns: M1MeasurementYarn[];
  files: { sin?: string; setx?: string };
  notes?: string;
};

export type M1KnowledgeFile = {
  version: number;
  stitchTypes: M1StitchType[];
  measurements: M1Measurement[];
};

export type M1KnittSymEntry = {
  index: number;
  char: string;
  mode: number;
  color: string;
};

export type M1KnittSymResult = {
  path: string | null;
  ok: boolean;
  count: number;
  chars: string[];
  entries: M1KnittSymEntry[];
};

export type M1BitmapEntry = {
  id: string;
  file_name: string;
  label: string;
  url: string;
};

export type M1BitmapCatalog = {
  dir: string | null;
  ok: boolean;
  items: M1BitmapEntry[];
};

export type M1MeshRow = {
  line: number;
  course: number;
  width: number;
  system: string;
  direction: string;
  mesh: string;
};

export type M1FabricStitchDef = {
  char: string;
  index: number;
  matrix: number[][];
  highlight: string;
  body: string;
  shadow: string;
};

export type M1FabricLibrary = {
  ok: boolean;
  sym_path: string | null;
  txt_path: string | null;
  count: number;
  stitches: M1FabricStitchDef[];
};

export type M1MeshYarn = {
  letter: string;
  color: string;
  description?: string;
};

export type M1MeshPart = {
  label: string;
  file_name: string;
  part_base: string;
  ok: boolean;
  error?: string;
  source?: 'wkt-file' | 'simx' | null;
  width?: number | null;
  row_count?: number;
  preview_rows?: number;
  display_width?: number;
  rows?: M1MeshRow[];
  yarns?: M1MeshYarn[];
  files?: {
    wkt?: string;
    simx?: string;
    sin?: string;
  };
};

export type M1MeshResult = {
  reference: string;
  folder_path: string;
  part?: M1MeshPart;
  parts?: M1MeshPart[];
  filled?: number;
  total?: number;
};
