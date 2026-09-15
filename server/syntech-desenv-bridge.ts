import { getPainelIdToken, patchFirestoreJson } from '../painel-tecelagem/publish-firebase.ts';
import {
  createSyntechProduto,
  listSyntechDesenvPendentes,
  listSyntechProdutoCatalog,
  listSyntechProdutoOpcoes,
} from './syntech-desenv.ts';

export const SYNTECH_CATALOG_COLLECTION = 'syntech_catalog';
export const SYNTECH_CATALOG_DOCUMENT = 'produtos';

export const SYNTECH_CATALOG_OPCOES = 'opcoes';
export const SYNTECH_CATALOG_PENDENTES = 'pendentes';
export const SYNTECH_CADASTROS_COLLECTION = 'syntech_cadastros';
export const DESENV_PUBLICO_COLLECTION = 'desenv_publico';
export const DESENV_PUBLICO_DOCUMENT = 'fila';

const SETORES = [
  { id: 'estilo', label: 'Desenv/estilo' },
  { id: 'modelagem', label: 'Modelagem' },
  { id: 'programacao', label: 'Programação' },
  { id: 'costura', label: 'Costura e acabamento' },
  { id: 'cliente', label: 'Envie ao cliente' },
  { id: 'encerrado', label: 'Encerrados' },
];

type FirestoreValue = Record<string, unknown>;

function decodeValue(value: FirestoreValue | undefined): unknown {
  if (!value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('booleanValue' in value) return Boolean(value.booleanValue);
  if ('nullValue' in value) return null;
  if ('timestampValue' in value) return String(value.timestampValue);
  if ('mapValue' in value) {
    const fields = (value.mapValue as { fields?: Record<string, FirestoreValue> }).fields ?? {};
    return decodeFields(fields);
  }
  if ('arrayValue' in value) {
    const values = (value.arrayValue as { values?: FirestoreValue[] }).values ?? [];
    return values.map((item) => decodeValue(item));
  }
  return null;
}

function decodeFields(fields: Record<string, FirestoreValue> | undefined) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

function encodeValue(value: unknown): FirestoreValue {
  if (value == null) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number' && Number.isInteger(value)) return { integerValue: String(value) };
  if (typeof value === 'number') return { doubleValue: value };
  return { stringValue: String(value) };
}

async function firestoreGet(path: string) {
  const session = await getPainelIdToken();
  if (!session) return null;
  const url = `https://firestore.googleapis.com/v1/projects/${session.projectId}/databases/(default)/documents/${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${session.idToken}` } });
  if (!res.ok) return null;
  return (await res.json()) as { documents?: Array<{ name: string; fields?: Record<string, FirestoreValue> }> };
}

async function firestoreQueryPendentes() {
  const session = await getPainelIdToken();
  if (!session) return [];
  const url = `https://firestore.googleapis.com/v1/projects/${session.projectId}/databases/(default)/documents:runQuery`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: SYNTECH_CADASTROS_COLLECTION }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'status' },
            op: 'EQUAL',
            value: { stringValue: 'pendente' },
          },
        },
        limit: 8,
      },
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Fila Syntech ${res.status}: ${text.slice(0, 240)}`);
  }
  const rows = (await res.json()) as Array<{
    document?: { name: string; fields?: Record<string, FirestoreValue> };
  }>;
  return rows
    .map((row) => {
      const name = row.document?.name ?? '';
      const id = name.split('/').pop() ?? '';
      if (!id) return null;
      return { id, ...decodeFields(row.document?.fields) };
    })
    .filter((row): row is Record<string, unknown> & { id: string } => Boolean(row));
}

async function firestorePatchFields(collection: string, id: string, fields: Record<string, unknown>) {
  const session = await getPainelIdToken();
  if (!session) throw new Error('Sem login do painel para gravar o cadastro.');
  const encoded: Record<string, FirestoreValue> = {};
  for (const [key, value] of Object.entries(fields)) encoded[key] = encodeValue(value);
  const mask = Object.keys(fields).map((key) => `updateMask.fieldPaths=${encodeURIComponent(key)}`).join('&');
  const url = `https://firestore.googleapis.com/v1/projects/${session.projectId}/databases/(default)/documents/${collection}/${id}?${mask}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${session.idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields: encoded }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Firestore ${res.status}: ${text.slice(0, 240)}`);
  }
}

function normalizeStatus(id: unknown) {
  const raw = String(id ?? '');
  if (raw === 'ficha') return 'estilo';
  if (SETORES.some((s) => s.id === raw)) return raw;
  return 'estilo';
}

function prioOf(item: Record<string, unknown>) {
  const n = Number(item.prioridade);
  return Number.isFinite(n) && n > 0 ? n : Number.POSITIVE_INFINITY;
}

async function publishDesenvPublico() {
  const listed = await firestoreGet('desenvolvimentos?pageSize=400');
  const items = (listed?.documents ?? []).map((doc) => {
    const id = doc.name.split('/').pop() ?? '';
    return { id, ...decodeFields(doc.fields) };
  });
  const setores = SETORES.map((setor) => {
    const itens = items
      .filter((item) => normalizeStatus(item.status) === setor.id)
      .sort((a, b) => {
        const d = prioOf(a) - prioOf(b);
        if (d) return d;
        return String(a.criado_em ?? '').localeCompare(String(b.criado_em ?? ''));
      })
      .map((item) => ({
        nome: String(item.nome ?? ''),
        ref: String(item.syntech_codigo ?? item.referencia ?? ''),
        cliente: String(item.cliente ?? ''),
        tipo: String(item.tipo ?? 'novo'),
        tipo_texto: String(item.tipo_texto ?? ''),
        trabalhando: item.trabalhando === true,
      }));
    return { id: setor.id, label: setor.label, n: itens.length, itens };
  });
  await patchFirestoreJson(DESENV_PUBLICO_COLLECTION, DESENV_PUBLICO_DOCUMENT, {
    updated_at: new Date().toISOString(),
    setores,
  });
}

export async function publishSyntechDesenvNuvem() {
  const catalog = await listSyntechProdutoCatalog();
  const opcoes = await listSyntechProdutoOpcoes();
  const pendentes = await listSyntechDesenvPendentes('');
  const now = new Date().toISOString();
  await patchFirestoreJson(SYNTECH_CATALOG_COLLECTION, SYNTECH_CATALOG_DOCUMENT, catalog, now);
  await patchFirestoreJson(SYNTECH_CATALOG_COLLECTION, SYNTECH_CATALOG_OPCOES, opcoes, now);
  await patchFirestoreJson(SYNTECH_CATALOG_COLLECTION, SYNTECH_CATALOG_PENDENTES, { itens: pendentes }, now);
  await publishDesenvPublico();
  console.log(
    `Nuvem desenv: ${Object.keys(catalog).length} produtos, ${pendentes.length} sem programa.`
  );
}

async function processCadastroFila() {
  const jobs = await firestoreQueryPendentes();
  for (const job of jobs) {
    const id = String(job.id);
    try {
      const result = await createSyntechProduto({
        codigo: String(job.codigo ?? ''),
        nome: String(job.nome ?? ''),
        classificacao: Number(job.classificacao),
        grupo: Number(job.grupo),
        fornecedor: Number(job.fornecedor),
        funcionario: Number(job.funcionario),
        ncm: String(job.ncm ?? ''),
      });
      await firestorePatchFields(SYNTECH_CADASTROS_COLLECTION, id, {
        status: 'ok',
        codigo: result.codigo,
        nome: result.nome,
        atualizado_em: new Date().toISOString(),
        erro: '',
      });
      console.log(`Syntech cadastro ok ${result.codigo}`);
    } catch (err) {
      const erro = err instanceof Error ? err.message : 'Não deu para cadastrar no Syntech.';
      await firestorePatchFields(SYNTECH_CADASTROS_COLLECTION, id, {
        status: 'erro',
        atualizado_em: new Date().toISOString(),
        erro,
      });
      console.warn(`Syntech cadastro falhou ${job.codigo}:`, erro);
    }
  }
}

export function startSyntechDesenvBridge() {
  const publish = () => {
    void publishSyntechDesenvNuvem().catch((err) => {
      console.warn('Nuvem desenv:', err instanceof Error ? err.message : err);
    });
  };
  const drain = () => {
    void processCadastroFila().catch((err) => {
      console.warn('Fila Syntech:', err instanceof Error ? err.message : err);
    });
  };
  publish();
  drain();
  setInterval(publish, 60_000);
  setInterval(drain, 5_000);
}
