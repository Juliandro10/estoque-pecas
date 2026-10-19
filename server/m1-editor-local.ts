import {
  DEFAULT_OLLAMA_URL,
  LOCAL_EDITOR_FALLBACK_MODEL,
  LOCAL_EDITOR_MODEL,
  type M1EditorSaida,
} from '../shared/m1-editor-model';
import { prepararBmp, describeImage } from './m1-editor-convert';
import { listSessionFiles, readEditorModelo } from './m1-editor-store';

const TAGS_TIMEOUT_MS = 4000;
const CHAT_TIMEOUT_MS = 8 * 60 * 1000;
const LOCAL_TOOL_NAMES = new Set(['listar_arquivos', 'info_imagem', 'preparar_bmp']);

type ToolCall = { id?: string; function: { name: string; arguments: Record<string, unknown> } };

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_name?: string;
};

export type LocalEditorAvailability = {
  ready: boolean;
  model: string;
  preferred: string;
  fallback: boolean;
  message: string;
  installed: string[];
};

function readEnv(name: string) {
  const raw = process.env[name]?.trim() ?? '';
  if (raw.length >= 2) {
    const quote = raw[0];
    if ((quote === '"' || quote === "'") && raw.endsWith(quote)) return raw.slice(1, -1).trim();
  }
  return raw;
}

export function ollamaUrl() {
  const value = readEnv('OLLAMA_URL').replace(/\/+$/, '');
  if (/^https?:\/\//i.test(value)) return value;
  return DEFAULT_OLLAMA_URL;
}

export function isLocalModelName(value: string) {
  return /^[\w.:-]{1,80}$/.test(value);
}

export function preferredLocalModel() {
  const saved = readEditorModelo();
  if (isLocalModelName(saved)) return saved;
  const value = readEnv('OLLAMA_MODEL');
  if (!value || !isLocalModelName(value)) return LOCAL_EDITOR_MODEL;
  return value;
}

export function uniqueModelNames(names: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name.trim());
  }
  return out.sort((a, b) => a.localeCompare(b, 'pt'));
}

function installedNames(body: { models?: { name?: string; model?: string }[] }) {
  const names: string[] = [];
  for (const row of body.models ?? []) {
    if (row.name?.trim()) names.push(row.name.trim());
    if (row.model?.trim()) names.push(row.model.trim());
  }
  return names;
}

export function findInstalledModel(names: string[], wanted: string) {
  const target = wanted.trim().toLowerCase();
  if (!target) return '';
  const exact = names.find((name) => name.toLowerCase() === target);
  if (exact) return exact;
  return names.find((name) => name.toLowerCase().startsWith(`${target}:`)) ?? '';
}

function pullLine(model: string) {
  return `ollama pull ${model}`;
}

export function resolveLocalEditor(options: {
  preferred: string;
  installed: string[];
  reachable: boolean;
  url: string;
  httpStatus?: number;
}): LocalEditorAvailability {
  const preferred = options.preferred || LOCAL_EDITOR_MODEL;
  if (!options.reachable) {
    const detail =
      options.httpStatus && options.httpStatus > 0
        ? `O Ollama em ${options.url} respondeu ${options.httpStatus}.`
        : `O Ollama não respondeu em ${options.url}.`;
    return {
      ready: false,
      model: preferred,
      preferred,
      fallback: false,
      installed: uniqueModelNames(options.installed),
      message: `${detail} Abra o Ollama neste PC. Para baixar o modelo, rode ${pullLine(preferred)}.`,
    };
  }
  const names = uniqueModelNames(options.installed);
  const installed = findInstalledModel(names, preferred);
  if (installed) {
    return {
      ready: true,
      model: installed,
      preferred,
      fallback: false,
      installed: names,
      message: `Local neste PC (${installed}), sem API. A resposta demora mais que o Composer.`,
    };
  }
  const fallbackName = LOCAL_EDITOR_FALLBACK_MODEL;
  const fallback = fallbackName.toLowerCase() === preferred.toLowerCase() ? '' : findInstalledModel(names, fallbackName);
  if (fallback) {
    return {
      ready: true,
      model: fallback,
      preferred,
      fallback: true,
      installed: names,
      message: `Falta o modelo ${preferred} no Ollama. Rode ${pullLine(preferred)}. Enquanto isso, o editor usa ${fallback}.`,
    };
  }
  return {
    ready: false,
    model: preferred,
    preferred,
    fallback: false,
    installed: names,
    message: `Falta o modelo ${preferred} no Ollama. Rode ${pullLine(preferred)}.`,
  };
}

export async function inspectLocalEditor(): Promise<LocalEditorAvailability> {
  const preferred = preferredLocalModel();
  const url = ollamaUrl();
  try {
    const res = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(TAGS_TIMEOUT_MS) });
    if (!res.ok) {
      return resolveLocalEditor({ preferred, installed: [], reachable: false, url, httpStatus: res.status });
    }
    const body = (await res.json()) as { models?: { name?: string; model?: string }[] };
    return resolveLocalEditor({ preferred, installed: installedNames(body), reachable: true, url });
  } catch {
    return resolveLocalEditor({ preferred, installed: [], reachable: false, url });
  }
}

export async function runLocalEditorTurn(options: {
  sessionId: string;
  root: string;
  prompt: string;
  history: { role: 'user' | 'assistant'; text: string }[];
  saida: M1EditorSaida;
  regras: string;
  dropped: () => boolean;
  onText: (chunk: string) => void;
  onTool: (name: string) => void;
}) {
  const status = await inspectLocalEditor();
  if (!status.ready) throw new Error(status.message);
  const tools = localTools(options.sessionId, options.root, options.saida);
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: [
        'Você edita arte de malha neste computador, sem internet.',
        `A saída é BMP de 24 bits, exatamente ${options.saida.largura} x ${options.saida.altura} pixels, com no máximo ${options.saida.cores} cores chapadas, fundo incluído.`,
        'Não estique o desenho. Chame preparar_bmp uma única vez e pare. Não grave PNG nem arquivo temporário.',
        'Se o pedido for só medir, use info_imagem e não grave arquivo.',
        'Responda em português, curto, com o nome do arquivo e a medida.',
        'Não escreva raciocínio nem tags. Chame a ferramenta direto, sem copiar a chamada no texto.',
        options.regras.trim() ? `Parâmetros gravados, seguir sempre:\n${options.regras.trim()}` : '',
      ].filter(Boolean).join('\n'),
    },
    ...options.history.slice(-6).map((row) => ({ role: row.role, content: row.text.slice(0, 4000) })),
    { role: 'user', content: options.prompt },
  ];
  let answer = '';
  for (let step = 0; step < 3; step += 1) {
    if (options.dropped()) break;
    const message = await ollamaChat(status.model, messages);
    messages.push(message);
    if (message.content.trim()) {
      answer += message.content;
      options.onText(message.content);
    }
    const calls = message.tool_calls ?? [];
    if (calls.length === 0) break;
    for (const call of calls) {
      if (options.dropped()) break;
      const name = call.function?.name ?? '';
      options.onTool(name);
      const tool = tools[name];
      let content = 'Ferramenta desconhecida.';
      if (tool) {
        try {
          content = await tool(call.function?.arguments ?? {});
        } catch (err) {
          content = err instanceof Error ? err.message : 'A ferramenta falhou.';
        }
      }
      messages.push({ role: 'tool', tool_name: name, content });
      options.onTool('');
    }
  }
  return answer.trim();
}

function localTools(sessionId: string, root: string, saida: M1EditorSaida) {
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  return {
    listar_arquivos: async () => {
      const files = listSessionFiles(sessionId);
      if (files.length === 0) return 'Nenhum arquivo ainda.';
      return files
        .filter((file) => !file.version)
        .map((file) => file.name)
        .join('\n');
    },
    info_imagem: async (args: Record<string, unknown>) => describeImage(root, text(args.entrada)),
    preparar_bmp: async (args: Record<string, unknown>) =>
      prepararBmp(root, text(args.entrada), text(args.saida) || undefined, saida.largura, saida.altura, saida.cores),
  } as Record<string, (args: Record<string, unknown>) => Promise<string>>;
}

const OLLAMA_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'listar_arquivos',
      description: 'Lista os arquivos de imagem desta conversa.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'info_imagem',
      description: 'Diz a largura e a altura de um arquivo.',
      parameters: {
        type: 'object',
        properties: { entrada: { type: 'string', description: 'Caminho, ex. arquivos/ficha.ai' } },
        required: ['entrada'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'preparar_bmp',
      description: 'Grava o BMP na medida e na quantidade de cores já definidas no editor, sem esticar.',
      parameters: {
        type: 'object',
        properties: {
          entrada: { type: 'string', description: 'Arquivo de origem.' },
          saida: { type: 'string', description: 'Nome do BMP novo em arquivos/.' },
        },
        required: ['entrada'],
      },
    },
  },
];

function stripThinking(content: string) {
  const withoutBlocks = content
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '')
    .replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
  const open = withoutBlocks.search(/<think(?:ing)?\b[^>]*>/i);
  const cut = open === -1 ? withoutBlocks : withoutBlocks.slice(0, open);
  return cut.replace(/<\/think(?:ing)?>/gi, '').trim();
}

function parseJsonObject(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

function normalizeArgs(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    const parsed = parseJsonObject(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    return {};
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function parseToolBody(inner: string): { name: string; arguments: Record<string, unknown> } | null {
  const json = parseJsonObject(inner);
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const row = json as Record<string, unknown>;
    const fn = row.function && typeof row.function === 'object' && !Array.isArray(row.function)
      ? (row.function as Record<string, unknown>)
      : null;
    const name = typeof row.name === 'string' ? row.name : typeof fn?.name === 'string' ? fn.name : '';
    if (name.trim()) {
      return { name: name.trim(), arguments: normalizeArgs(row.arguments ?? row.parameters ?? fn?.arguments) };
    }
  }
  const fn = inner.match(/<function=([^>\s]+)>/i) ?? inner.match(/<function>([^<]+)<\/function>/i);
  if (!fn) return null;
  const args: Record<string, unknown> = {};
  for (const param of inner.matchAll(/<parameter=([^>\s]+)>\s*([\s\S]*?)\s*<\/parameter>/gi)) {
    args[param[1]] = param[2].trim();
  }
  const name = fn[1].trim();
  if (!name) return null;
  return { name, arguments: args };
}

function parseToolCalls(content: string): ToolCall[] {
  const calls: ToolCall[] = [];
  for (const match of content.matchAll(/<tool_call>([\s\S]*?)<\/tool_call>/gi)) {
    const call = parseToolBody(match[1] ?? '');
    if (call && LOCAL_TOOL_NAMES.has(call.name)) calls.push({ function: call });
  }
  if (calls.length === 0) {
    for (const match of content.matchAll(/<function=[^>\s]+>[\s\S]*?<\/function>/gi)) {
      const call = parseToolBody(match[0] ?? '');
      if (call && LOCAL_TOOL_NAMES.has(call.name)) calls.push({ function: call });
    }
  }
  if (calls.length > 0) return calls;
  const trimmed = content.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return [];
  const bare = parseToolBody(trimmed);
  if (bare && LOCAL_TOOL_NAMES.has(bare.name)) return [{ function: bare }];
  return [];
}

function stripToolMarkup(content: string) {
  const without = content
    .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, '')
    .replace(/<function=[^>\s]+>[\s\S]*?<\/function>/gi, '');
  const trimmed = without.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    const bare = parseToolBody(trimmed);
    if (bare && LOCAL_TOOL_NAMES.has(bare.name)) return '';
  }
  return without.trim();
}

function normalizeToolCall(value: unknown): ToolCall | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as { id?: unknown; function?: { name?: unknown; arguments?: unknown } };
  const name = typeof row.function?.name === 'string' ? row.function.name.trim() : '';
  if (!name) return null;
  const call: ToolCall = { function: { name, arguments: normalizeArgs(row.function?.arguments) } };
  if (typeof row.id === 'string' && row.id.trim()) call.id = row.id.trim();
  return call;
}

export function normalizeOllamaAssistant(raw: {
  content?: unknown;
  thinking?: unknown;
  tool_calls?: unknown;
}): ChatMessage {
  const content = typeof raw.content === 'string' ? raw.content : '';
  const thinking = typeof raw.thinking === 'string' ? raw.thinking : '';
  const structured = Array.isArray(raw.tool_calls)
    ? raw.tool_calls.flatMap((call) => {
        const normalized = normalizeToolCall(call);
        return normalized ? [normalized] : [];
      })
    : [];
  const visible = stripThinking(content);
  let tool_calls = structured;
  if (tool_calls.length === 0) tool_calls = parseToolCalls(visible);
  if (tool_calls.length === 0 && thinking.trim()) tool_calls = parseToolCalls(stripThinking(thinking) || thinking);
  if (tool_calls.length === 0 && !visible.trim()) tool_calls = parseToolCalls(content);
  const message: ChatMessage = { role: 'assistant', content: stripToolMarkup(visible) };
  if (tool_calls.length > 0) message.tool_calls = tool_calls;
  return message;
}

function isTimeout(err: unknown) {
  return err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');
}

async function ollamaChat(model: string, messages: ChatMessage[]) {
  const payload: Record<string, unknown> = {
    model,
    messages,
    tools: OLLAMA_TOOLS,
    stream: false,
  };
  // Qwen3 pensa por padrão. No tool calling isso mistura a chamada no texto e, em CPU, atrasa demais.
  if (/qwen3/i.test(model)) payload.think = false;
  const url = ollamaUrl();
  let res: Response;
  try {
    res = await fetch(`${url}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
    });
  } catch (err) {
    if (isTimeout(err)) {
      throw new Error(`O modelo ${model} demorou demais neste PC. Em CPU a resposta é mais lenta; tente de novo.`);
    }
    throw new Error(`O Ollama não respondeu em ${url}. Abra o Ollama neste PC.`);
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    if (res.status === 404 || /not found/i.test(detail)) {
      throw new Error(`Falta o modelo ${model} no Ollama. Rode ${pullLine(model)}.`);
    }
    throw new Error(`O modelo local respondeu ${res.status}.`);
  }
  const body = (await res.json()) as {
    message?: { content?: unknown; thinking?: unknown; tool_calls?: unknown };
  };
  if (!body.message) throw new Error('O modelo local não devolveu resposta.');
  return normalizeOllamaAssistant(body.message);
}
