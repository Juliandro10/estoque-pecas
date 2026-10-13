import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_M1_EDITOR_MODEL, normalizeM1EditorModel, type M1EditorModelChoice } from '../shared/m1-editor-model';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const m1EditorRoot = path.join(__dirname, '..', 'data', 'm1-editor');

const IMAGE_EXT = new Set(['.bmp', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff', '.svg']);

export type M1EditorMessage = {
  role: 'user' | 'assistant';
  text: string;
  at: string;
};

export type M1EditorSession = {
  id: string;
  agentId?: string;
  title: string;
  reference: string;
  createdAt: string;
  updatedAt: string;
  model?: M1EditorModelChoice;
  messages: M1EditorMessage[];
};

export type M1EditorFile = {
  name: string;
  bytes: number;
  mtime: number;
  image: boolean;
  version: boolean;
  url: string;
};

type IndexFile = { sessions: M1EditorSession[] };

function indexPath() {
  return path.join(m1EditorRoot, 'index.json');
}

export function sessionDir(id: string) {
  return path.join(m1EditorRoot, 'work', safeSessionId(id));
}

export function safeSessionId(raw: string) {
  const id = raw.trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Conversa inválida.');
  return id;
}

export function resolveInside(root: string, rel: string) {
  const trimmed = rel.trim().replace(/\\/g, '/');
  if (!trimmed || trimmed.includes('\0')) throw new Error('Caminho inválido.');
  const full = path.resolve(root, trimmed);
  const base = path.resolve(root);
  if (full !== base && !full.startsWith(base + path.sep)) {
    throw new Error('Caminho fora da pasta da conversa.');
  }
  return full;
}

function readIndex(): IndexFile {
  try {
    const parsed = JSON.parse(fs.readFileSync(indexPath(), 'utf8')) as IndexFile;
    if (!Array.isArray(parsed.sessions)) return { sessions: [] };
    return parsed;
  } catch {
    return { sessions: [] };
  }
}

function writeIndex(index: IndexFile) {
  fs.mkdirSync(m1EditorRoot, { recursive: true });
  const tmp = `${indexPath()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2));
  fs.copyFileSync(tmp, indexPath());
  fs.rmSync(tmp, { force: true });
}

export function listSessions() {
  return readIndex()
    .sessions
    .map(({ id, title, reference, createdAt, updatedAt }) => ({ id, title, reference, createdAt, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getSession(id: string) {
  const safe = safeSessionId(id);
  const session = readIndex().sessions.find((row) => row.id === safe);
  if (!session) throw new Error('Conversa não encontrada.');
  return session;
}

function saveSession(session: M1EditorSession) {
  const index = readIndex();
  const idx = index.sessions.findIndex((row) => row.id === session.id);
  if (idx >= 0) index.sessions[idx] = session;
  else index.sessions.push(session);
  writeIndex(index);
  return session;
}

const BRIEF = `Você é o editor de arte de malha do Desenv-M1. A pasta desta conversa é o seu trabalho.
- Trabalhe só nesta pasta. Grave os resultados em arquivos/. Não apague o que já existe; use um nome novo.
- A pasta versoes/ é histórico. Não altere esses arquivos.
- Saída para a máquina de tricô: BMP de 24 bits, na medida exata em pixel, com cores chapadas do fio. Cor misturada vira fio novo.
- Linha N contada de baixo para cima: numa imagem de altura A, a linha N fica em y = A - N, com y = 0 no topo. A linha 1 é a de baixo.
- Para converter PDF, Photoshop (.psd), Illustrator (.ai), HTML ou imagem, use converter_para_imagem.
- Para deixar só as cores do fio, use quantizar_cores.
- Pode buscar na internet quando o pedido pedir uma referência. A referência não substitui o arquivo da malha.
- Arquivo .ai de ficha costuma ser um PDF.
- Se a pessoa pedir para medir, prever ou confirmar antes de editar, responda só com a medida e não grave arquivo ainda.
- Grave a imagem pronta em arquivos/. O programa copia essa imagem para a pasta da referência.
- Responda em português, curto, dizendo o arquivo gravado e a medida.`;

export function createSession(title?: string) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const dir = sessionDir(id);
  fs.mkdirSync(path.join(dir, 'arquivos'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'versoes'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'INSTRUCOES.md'), `${BRIEF}\n`, 'utf8');
  const session: M1EditorSession = {
    id,
    title: (title ?? '').trim() || 'Nova conversa',
    reference: '',
    model: { ...DEFAULT_M1_EDITOR_MODEL },
    createdAt: now,
    updatedAt: now,
    messages: [],
  };
  return saveSession(session);
}

export function updateSession(id: string, patch: Partial<Pick<M1EditorSession, 'title' | 'reference' | 'agentId' | 'messages' | 'model'>>) {
  const session = getSession(id);
  const next: M1EditorSession = {
    ...session,
    ...patch,
    id: session.id,
    model: patch.model ? normalizeM1EditorModel(patch.model) : normalizeM1EditorModel(session.model),
    updatedAt: new Date().toISOString(),
  };
  if (next.messages.length > 100) next.messages = next.messages.slice(-100);
  return saveSession(next);
}

export function editorBrief() {
  return BRIEF;
}

function safeUploadName(name: string) {
  const base = path.basename(name).replace(/[^\w.\- ()\u00C0-\u024f]+/g, '_').trim();
  if (!base || base === '.' || base === '..' || base.length > 180) throw new Error('Nome de arquivo inválido.');
  return base;
}

function uniqueName(dir: string, name: string) {
  if (!fs.existsSync(path.join(dir, name))) return name;
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  for (let i = 2; i < 100; i += 1) {
    const next = `${stem} (${i})${ext}`;
    if (!fs.existsSync(path.join(dir, next))) return next;
  }
  throw new Error('Muitos arquivos com o mesmo nome.');
}

export function saveUpload(id: string, fileName: string, buffer: Buffer) {
  if (!buffer.length) throw new Error('Arquivo vazio.');
  if (buffer.length > 40 * 1024 * 1024) throw new Error('Arquivo maior que 40 MB.');
  const dir = path.join(sessionDir(id), 'arquivos');
  fs.mkdirSync(dir, { recursive: true });
  const stored = uniqueName(dir, safeUploadName(fileName));
  fs.writeFileSync(path.join(dir, stored), buffer);
  updateSession(id, {});
  return stored;
}

function fileUrl(id: string, rel: string, mtime: number) {
  return `/api/programs/m1-editor/file?session=${encodeURIComponent(id)}&name=${encodeURIComponent(rel)}&v=${mtime}`;
}

function walkFiles(dir: string, relBase: string, version: boolean, id: string, out: M1EditorFile[]) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, rel, version, id, out);
      continue;
    }
    const stat = fs.statSync(full);
    const ext = path.extname(entry.name).toLowerCase();
    out.push({
      name: rel,
      bytes: stat.size,
      mtime: Math.round(stat.mtimeMs),
      image: IMAGE_EXT.has(ext),
      version,
      url: fileUrl(id, rel, Math.round(stat.mtimeMs)),
    });
  }
}

export function listSessionFiles(id: string): M1EditorFile[] {
  const root = sessionDir(id);
  const files: M1EditorFile[] = [];
  walkFiles(path.join(root, 'arquivos'), 'arquivos', false, id, files);
  walkFiles(path.join(root, 'versoes'), 'versoes', true, id, files);
  files.sort((a, b) => b.mtime - a.mtime);
  return files;
}

export function snapshotArquivos(id: string) {
  const src = path.join(sessionDir(id), 'arquivos');
  if (!fs.existsSync(src)) return null;
  const names = fs.readdirSync(src).filter((name) => {
    const full = path.join(src, name);
    return fs.statSync(full).isFile() && IMAGE_EXT.has(path.extname(name).toLowerCase());
  });
  if (names.length === 0) return null;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(sessionDir(id), 'versoes', stamp);
  fs.mkdirSync(dest, { recursive: true });
  for (const name of names) fs.copyFileSync(path.join(src, name), path.join(dest, name));
  return stamp;
}

export const editedImagesRoot = 'C:\\Users\\User\\Desktop\\Imagens editadas';

export type ArquivoStamp = { name: string; bytes: number; mtimeMs: number };

export function listArquivoStamps(id: string): ArquivoStamp[] {
  const dir = path.join(sessionDir(id), 'arquivos');
  const out: ArquivoStamp[] = [];
  function walk(current: string, relBase: string) {
    if (!fs.existsSync(current)) return;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const full = path.join(current, entry.name);
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(full, rel);
        continue;
      }
      if (!IMAGE_EXT.has(path.extname(entry.name).toLowerCase())) continue;
      if (path.basename(entry.name).startsWith('_preview')) continue;
      const stat = fs.statSync(full);
      out.push({ name: rel, bytes: stat.size, mtimeMs: stat.mtimeMs });
    }
  }
  walk(dir, '');
  return out;
}

function referenceFolderName(reference: string) {
  const name = reference.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/^\.+$/, '').trim();
  return name.slice(0, 80);
}

export function publishEditedImages(id: string, reference: string, before: ArquivoStamp[]) {
  const folder = referenceFolderName(reference);
  if (!folder) return [];
  const previous = new Map(before.map((file) => [file.name, `${file.mtimeMs}:${file.bytes}`]));
  const changed = listArquivoStamps(id).filter((file) => previous.get(file.name) !== `${file.mtimeMs}:${file.bytes}`);
  if (changed.length === 0) return [];
  const destDir = path.join(editedImagesRoot, folder);
  fs.mkdirSync(destDir, { recursive: true });
  const saved: string[] = [];
  for (const file of changed) {
    const src = path.join(sessionDir(id), 'arquivos', ...file.name.split('/'));
    const stored = uniqueName(destDir, path.basename(file.name));
    fs.copyFileSync(src, path.join(destDir, stored));
    saved.push(path.join(destDir, stored));
  }
  return saved;
}

export function resolveSessionFile(id: string, name: string) {
  const full = resolveInside(sessionDir(id), name);
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) throw new Error('Arquivo não encontrado.');
  return full;
}
