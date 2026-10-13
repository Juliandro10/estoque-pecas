import express from 'express';
import fs from 'node:fs';
import path from 'node:path';

import { m1EditorSdkModel, normalizeM1EditorModel } from '../shared/m1-editor-model';
import { converterParaImagem, describeImage, previewPng, quantizarCores } from './m1-editor-convert';
import {
  createSession,
  editorBrief,
  getSession,
  listArquivoStamps,
  listSessionFiles,
  listSessions,
  publishEditedImages,
  resolveSessionFile,
  safeSessionId,
  saveUpload,
  sessionDir,
  snapshotArquivos,
  updateSession,
} from './m1-editor-store';

type LiveTurn = {
  dropped: boolean;
  cancel: () => void;
};

const live = new Map<string, { token: number; turn: LiveTurn }>();
let turnSeq = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function num(value: unknown) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function editorTools(root: string) {
  return {
    listar_arquivos: {
      description: 'Lista os arquivos desta conversa, com caminho relativo.',
      inputSchema: { type: 'object', properties: {} },
      async execute() {
        const files = listSessionFiles(path.basename(root));
        if (files.length === 0) return 'Nenhum arquivo ainda.';
        return files.map((file) => `${file.name} (${file.bytes} bytes${file.version ? ', versão' : ''})`).join('\n');
      },
    },
    info_imagem: {
      description: 'Mede uma imagem, PDF ou Illustrator. Diz largura, altura e como achar uma linha contada de baixo.',
      inputSchema: {
        type: 'object',
        properties: { entrada: { type: 'string', description: 'Caminho relativo, ex. arquivos/onca.bmp' } },
        required: ['entrada'],
      },
      async execute(args: Record<string, unknown>) {
        return describeImage(root, text(args.entrada));
      },
    },
    converter_para_imagem: {
      description:
        'Converte imagem, PDF, Photoshop, Illustrator ou HTML para PNG, JPG ou BMP de 24 bits. Se largura e altura vierem juntas, estica exatamente nessa medida.',
      inputSchema: {
        type: 'object',
        properties: {
          entrada: { type: 'string', description: 'Caminho relativo ou URL http(s)' },
          saida: { type: 'string', description: 'Caminho de saída. Use .bmp para a máquina.' },
          largura: { type: 'number' },
          altura: { type: 'number' },
          pagina: { type: 'number', description: 'Página do PDF, começando em 1' },
          pixel: { type: 'boolean', description: 'true mantém borda dura de malha. false suaviza foto.' },
        },
        required: ['entrada'],
      },
      async execute(args: Record<string, unknown>) {
        return converterParaImagem(root, {
          entrada: text(args.entrada),
          saida: text(args.saida) || undefined,
          largura: num(args.largura),
          altura: num(args.altura),
          pagina: num(args.pagina),
          pixel: args.pixel !== false,
        });
      },
    },
    quantizar_cores: {
      description: 'Troca cada pixel pela cor de fio mais próxima. Não cria cor nova. Saída recomendada: .bmp',
      inputSchema: {
        type: 'object',
        properties: {
          entrada: { type: 'string' },
          saida: { type: 'string' },
          cores: {
            type: 'array',
            items: { type: 'string' },
            description: 'Lista r,g,b. Ex.: ["138,92,49","14,16,26"]',
          },
        },
        required: ['entrada', 'saida', 'cores'],
      },
      async execute(args: Record<string, unknown>) {
        return quantizarCores(root, text(args.entrada), text(args.saida), args.cores);
      },
    },
  };
}

function mimeFromExt(ext: string) {
  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    case '.bmp':
      return 'image/bmp';
    case '.svg':
      return 'image/svg+xml';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

function saveAssistant(id: string, assistant: string, emptyNote = false) {
  const current = getSession(id);
  const text = assistant.trim() || (emptyNote ? 'Não houve texto de resposta.' : '');
  if (!text) return;
  const messages = [...current.messages];
  const last = messages[messages.length - 1];
  if (last?.role === 'assistant') {
    if (last.text === text) return;
    messages[messages.length - 1] = { ...last, text };
  } else {
    messages.push({ role: 'assistant', text, at: new Date().toISOString() });
  }
  updateSession(id, { messages });
}

function sendEvent(res: express.Response, payload: unknown) {
  if (res.writableEnded) return;
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function pushText(acc: string, chunk: string, res: express.Response) {
  if (!chunk) return acc;
  if (chunk.startsWith(acc)) {
    const delta = chunk.slice(acc.length);
    if (delta) sendEvent(res, { type: 'text', text: delta });
    return chunk;
  }
  sendEvent(res, { type: 'text', text: chunk });
  return acc + chunk;
}

export function registerM1EditorUpload(app: express.Express) {
  app.post(
    '/api/programs/m1-editor/sessions/:id/files',
    express.raw({ type: () => true, limit: '40mb' }),
    (req, res) => {
      try {
        const id = safeSessionId(String(req.params.id));
        getSession(id);
        const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
        const stored = saveUpload(id, String(req.query.file_name ?? req.query.fileName ?? 'arquivo.bin'), buffer);
        res.json({ ok: true, name: `arquivos/${stored}`, files: listSessionFiles(id) });
      } catch (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : 'Erro ao receber o arquivo.' });
      }
    }
  );
}

export function registerM1EditorRoutes(app: express.Express) {
  app.get('/api/programs/m1-editor/status', (_req, res) => {
    res.json({
      ok: true,
      configured: Boolean(process.env.CURSOR_API_KEY?.trim()),
      model: m1EditorSdkModel(undefined).id,
    });
  });

  app.get('/api/programs/m1-editor/sessions', (_req, res) => {
    res.json({ sessions: listSessions() });
  });

  app.post('/api/programs/m1-editor/sessions', (req, res) => {
    let session = createSession(typeof req.body?.title === 'string' ? req.body.title : undefined);
    if (req.body?.model && typeof req.body.model === 'object') {
      session = updateSession(session.id, { model: normalizeM1EditorModel(req.body.model) });
    }
    res.status(201).json({ session, files: listSessionFiles(session.id) });
  });

  app.get('/api/programs/m1-editor/sessions/:id', (req, res) => {
    try {
      const session = getSession(String(req.params.id));
      res.json({ session, files: listSessionFiles(session.id) });
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Conversa não encontrada.' });
    }
  });

  app.put('/api/programs/m1-editor/sessions/:id', (req, res) => {
    try {
      const patch: {
        title?: string;
        reference?: string;
        model?: ReturnType<typeof normalizeM1EditorModel>;
        messages?: { role: 'user' | 'assistant'; text: string; at: string }[];
      } = {};
      if (typeof req.body?.title === 'string') patch.title = req.body.title.trim() || 'Nova conversa';
      if (typeof req.body?.reference === 'string') patch.reference = req.body.reference.trim();
      if (req.body?.model && typeof req.body.model === 'object') patch.model = normalizeM1EditorModel(req.body.model);
      if (Array.isArray(req.body?.messages)) {
        const incoming = req.body.messages.slice(-100).flatMap((row: { role?: string; text?: string; at?: string }) => {
          if (row?.role !== 'user' && row?.role !== 'assistant') return [];
          const text = String(row.text ?? '').slice(0, 20000);
          if (row.role === 'assistant' && text.trim() === 'Não houve texto de resposta.') return [];
          return [{
            role: row.role,
            text,
            at: typeof row.at === 'string' ? row.at : new Date().toISOString(),
          }];
        }).filter((row: { role: string; text: string }, index: number, list: { role: string; text: string }[]) => {
          const prev = list[index - 1];
          return !(prev && prev.role === row.role && prev.text === row.text);
        });
        const current = getSession(String(req.params.id));
        if (incoming.length >= current.messages.length) patch.messages = incoming;
      }
      const session = updateSession(String(req.params.id), patch);
      res.json({ session });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Não deu para salvar.' });
    }
  });

  app.get('/api/programs/m1-editor/file', async (req, res) => {
    try {
      const full = resolveSessionFile(String(req.query.session ?? ''), String(req.query.name ?? ''));
      res.setHeader('Cache-Control', 'no-cache');
      if (req.query.preview === '1') {
        const png = await previewPng(full);
        res.setHeader('Content-Type', 'image/png');
        res.end(png);
        return;
      }
      res.setHeader('Content-Type', mimeFromExt(path.extname(full).toLowerCase()));
      fs.createReadStream(full).pipe(res);
    } catch (err) {
      res.status(404).json({ error: err instanceof Error ? err.message : 'Arquivo não encontrado.' });
    }
  });

  app.post('/api/programs/m1-editor/sessions/:id/chat', async (req, res) => {
    const id = String(req.params.id);
    const message = text(req.body?.message);
    if (!message) {
      res.status(400).json({ error: 'Escreva o pedido.' });
      return;
    }
    if (message.length > 12000) {
      res.status(400).json({ error: 'Pedido longo demais.' });
      return;
    }
    const apiKey = process.env.CURSOR_API_KEY?.trim();
    if (!apiKey) {
      res.status(400).json({
        error: 'Falta CURSOR_API_KEY no .env. Crie em Cursor Dashboard → API Keys, cole no .env e reinicie o scanner.',
      });
      return;
    }
    const previous = live.get(id);
    if (previous) previous.turn.cancel();
    const waitUntil = Date.now() + 6000;
    while (previous && live.get(id) === previous && Date.now() < waitUntil) await sleep(40);

    const token = ++turnSeq;
    const turn: LiveTurn = {
      dropped: false,
      cancel: () => {
        turn.dropped = true;
      },
    };
    live.set(id, { token, turn });
    const release = () => {
      if (live.get(id)?.token === token) live.delete(id);
    };

    let session;
    try {
      session = getSession(id);
    } catch (err) {
      release();
      res.status(404).json({ error: err instanceof Error ? err.message : 'Conversa não encontrada.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const choice = normalizeM1EditorModel(req.body?.model ?? session.model);
    const filesBefore = listSessionFiles(id)
      .filter((file) => !file.version)
      .map((file) => file.name)
      .join('\n');
    const first = session.messages.length === 0;
    const refLine = session.reference ? `Referência da peça: ${session.reference}\n` : '';
    const prompt = first
      ? `${editorBrief()}\n\n${refLine}Pedido:\n${message}\n\nArquivos:\n${filesBefore || '(nenhum)'}`
      : `${refLine}Pedido:\n${message}\n\nArquivos agora:\n${filesBefore || '(nenhum)'}\n\nSe o pedido for só medir, prever ou confirmar antes de editar, responda em texto e não grave arquivo. Se for para editar, grave um arquivo novo em arquivos/, BMP de 24 bits, na medida exata pedida. Se o pedido for só a costa, não junte a frente. Quando o arquivo estiver gravado, responda e pare.`;

    session = updateSession(id, {
      title: session.title === 'Nova conversa' ? message.slice(0, 48) : session.title,
      model: choice,
      messages: [...session.messages, { role: 'user', text: message, at: new Date().toISOString() }],
    });

    let assistant = '';
    let closedByUs = false;
    let published = false;
    const before = listArquivoStamps(id);
    const publishNow = () => {
      if (published) return [] as string[];
      published = true;
      try {
        const saved = publishEditedImages(id, getSession(id).reference, before);
        if (saved.length) {
          const note = `Salvo em:\n${saved.join('\n')}`;
          assistant = assistant.trim() ? `${assistant.trim()}\n\n${note}` : note;
        }
        return saved;
      } catch (err) {
        console.error('[m1-editor] pasta da referência', err instanceof Error ? err.message : err);
        return [];
      }
    };
    try {
      snapshotArquivos(id);
      const sdk = await import('@cursor/sdk');
      const root = sessionDir(id);
      const local = {
        cwd: root,
        autoReview: true,
        customTools: editorTools(root),
      };
      const selection = m1EditorSdkModel(choice);
      const agent = session.agentId
        ? await sdk.Agent.resume(session.agentId, { apiKey, model: selection, local })
        : await sdk.Agent.create({ apiKey, model: selection, local });
      if (!session.agentId) updateSession(id, { agentId: agent.agentId });

      try {
        const startRun = (force: boolean) =>
          agent.send(prompt, { model: selection, local: force ? { force: true } : undefined });
        let run: Awaited<ReturnType<typeof startRun>> | undefined;
        try {
          run = await startRun(false);
        } catch (err) {
          const stuck = err instanceof Error && /already has active run/i.test(err.message);
          if (!stuck) throw err;
          console.log(`[m1-editor] sessão ${id} tinha resposta presa; encerrando e seguindo`);
          run = await startRun(true);
        }
        console.log(`[m1-editor] session ${id} agent ${agent.agentId} run ${run.id}`);
        const stopRun = () => {
          turn.dropped = true;
          if (run.supports('cancel')) void run.cancel().catch(() => undefined);
        };
        turn.cancel = stopRun;
        res.on('close', () => {
          if (!closedByUs) stopRun();
        });
        let toolBusy = false;
        if (!turn.dropped) {
          for await (const event of run.stream()) {
            if (turn.dropped) break;
            if (event.type === 'assistant') {
              for (const block of event.message.content) {
                if (block.type === 'text') assistant = pushText(assistant, block.text, res);
              }
            } else if (event.type === 'tool_call' && event.status === 'running') {
              toolBusy = true;
              sendEvent(res, { type: 'tool', name: event.name });
            } else if (event.type === 'tool_call') {
              toolBusy = false;
              sendEvent(res, { type: 'tool', name: '' });
            } else if (event.type === 'usage' && assistant.trim() && !toolBusy) {
              break;
            } else if (event.type === 'status' && event.status === 'ERROR') {
              throw new Error(event.message || 'Falha no agente.');
            }
          }
        }
        publishNow();
        if (!turn.dropped) {
          saveAssistant(id, assistant, true);
          sendEvent(res, { type: 'done', status: 'finished' });
          closedByUs = true;
          if (!res.writableEnded) res.end();
        } else if (assistant.trim()) {
          saveAssistant(id, assistant);
        }
      } finally {
        await Promise.race([
          (async () => {
            if (run?.supports('cancel')) {
              try {
                await run.cancel();
              } catch {
                /* a resposta já encerrou */
              }
              try {
                await run.wait();
              } catch {
                /* o cancelamento encerra a espera */
              }
            }
            await agent[Symbol.asyncDispose]();
          })(),
          sleep(4000),
        ]);
      }
    } catch (err) {
      const sdk = await import('@cursor/sdk').catch(() => null);
      const messageText =
        sdk && err instanceof sdk.CursorAgentError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Falha no agente.';
      sendEvent(res, { type: 'error', error: messageText });
      console.error('[m1-editor]', messageText);
    } finally {
      try {
        publishNow();
        if (assistant.trim()) saveAssistant(id, assistant);
      } catch (err) {
        console.error('[m1-editor] histórico', err instanceof Error ? err.message : err);
      }
      release();
      closedByUs = true;
      if (!res.writableEnded) res.end();
    }
  });
}
