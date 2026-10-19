import { LOCAL_EDITOR_MODEL, type M1EditorSaida } from '../shared/m1-editor-model';
import { prepararBmp, describeImage } from './m1-editor-convert';
import { listSessionFiles } from './m1-editor-store';

const OLLAMA = 'http://127.0.0.1:11434';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[];
  tool_name?: string;
};

export async function localModelReady() {
  try {
    const res = await fetch(`${OLLAMA}/api/tags`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return false;
    const body = (await res.json()) as { models?: { name?: string }[] };
    return (body.models ?? []).some((row) => (row.name ?? '').startsWith(LOCAL_EDITOR_MODEL));
  } catch {
    return false;
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
  if (!(await localModelReady())) {
    throw new Error('O modelo local ainda não está pronto neste PC. Espere o download terminar e tente de novo.');
  }
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
        options.regras.trim() ? `Parâmetros gravados, seguir sempre:\n${options.regras.trim()}` : '',
      ].filter(Boolean).join('\n'),
    },
    ...options.history.slice(-6).map((row) => ({ role: row.role, content: row.text.slice(0, 4000) })),
    { role: 'user', content: options.prompt },
  ];
  let answer = '';
  for (let step = 0; step < 3; step += 1) {
    if (options.dropped()) break;
    const message = await ollamaChat(messages);
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

async function ollamaChat(messages: ChatMessage) {
  const res = await fetch(`${OLLAMA}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: LOCAL_EDITOR_MODEL, messages, tools: OLLAMA_TOOLS, stream: false }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`O modelo local respondeu ${res.status}.`);
  const body = (await res.json()) as { message?: ChatMessage };
  if (!body.message) throw new Error('O modelo local não devolveu resposta.');
  return body.message;
}
