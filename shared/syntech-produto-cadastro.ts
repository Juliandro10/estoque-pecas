export const SYNTECH_BICO_UI = 10;
export const SYNTECH_GUIA_SLOTS = 8;
export const SYNTECH_TEMPO_SLOTS = 8;

export type SyntechProdutoBico = {
  bico: number;
  parte: string;
  tipo_fio: number | null;
  perc: number | null;
  cabo: number | null;
  peso: number | null;
};

export type SyntechProdutoParte = {
  parte: string;
  quant: number;
};

export type SyntechProdutoCor = {
  cor: number;
  nome: string;
  principal: boolean;
};

export type SyntechProdutoGuia = {
  numero: number;
  esquerda: string;
  cabo: string;
  direita: string;
  cabod: string;
  cor_do_fio: string;
};

export type SyntechProdutoTempo = {
  numero: number;
  descricao: string;
  tempo: string;
  peso: number | null;
};

export type SyntechProdutoCadastro = {
  codigo: string;
  nome: string;
  unidade: string;
  peso_bruto: number;
  peso_liquido: number;
  classificacao: number | null;
  grupo: number | null;
  fornecedor: number | null;
  funcionario: number | null;
  ncm: string;
  estoque_minimo: number;
  dias_entrega: number;
  observacoes: string;
  programa: string;
  maquina: number | null;
  bicos: SyntechProdutoBico[];
  partes: SyntechProdutoParte[];
  cores: SyntechProdutoCor[];
  guias: SyntechProdutoGuia[];
  tempos: SyntechProdutoTempo[];
};

export type SyntechLookupOption = {
  codigo: number;
  nome: string;
};

export type SyntechProdutoCadastroOpcoes = {
  classificacoes: SyntechLookupOption[];
  grupos: SyntechLookupOption[];
  fornecedores: SyntechLookupOption[];
  funcionarios: SyntechLookupOption[];
  ncms: Array<{ codigo: string }>;
  tipos_fio: SyntechLookupOption[];
  maquinas: Array<{ numero: number; nome: string }>;
  defaults: {
    classificacao: number | null;
    grupo: number | null;
    fornecedor: number | null;
    funcionario: number | null;
    ncm: string;
  };
};

function emptyBicos(): SyntechProdutoBico[] {
  return Array.from({ length: SYNTECH_BICO_UI }, (_, i) => ({
    bico: i + 1,
    parte: '',
    tipo_fio: null,
    perc: null,
    cabo: null,
    peso: null,
  }));
}

function emptyGuias(): SyntechProdutoGuia[] {
  return Array.from({ length: SYNTECH_GUIA_SLOTS }, (_, i) => ({
    numero: i + 1,
    esquerda: '',
    cabo: '',
    direita: '',
    cabod: '',
    cor_do_fio: '',
  }));
}

function emptyTempos(): SyntechProdutoTempo[] {
  return Array.from({ length: SYNTECH_TEMPO_SLOTS }, (_, i) => ({
    numero: i + 1,
    descricao: '',
    tempo: '',
    peso: null,
  }));
}

export function emptySyntechProdutoCadastro(codigo = ''): SyntechProdutoCadastro {
  return {
    codigo,
    nome: '',
    unidade: 'PC',
    peso_bruto: 0,
    peso_liquido: 0,
    classificacao: null,
    grupo: null,
    fornecedor: null,
    funcionario: null,
    ncm: '',
    estoque_minimo: 0,
    dias_entrega: 0,
    observacoes: '',
    programa: '',
    maquina: null,
    bicos: emptyBicos(),
    partes: [],
    cores: [],
    guias: emptyGuias(),
    tempos: emptyTempos(),
  };
}
