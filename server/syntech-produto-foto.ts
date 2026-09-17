import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';

import { clipSyntechText, attachSyntechDb, detachDb, queryDb, syntechFbConfig } from './syntech-db';

const FOTO_HOSTS = ['RENATA', '192.168.1.52', '192.168.1.69'];
const FOTO_SUBS = ['', 'Fotos', 'Foto', 'Imagens', 'imagens', 'FOTOS', 'Img', 'ImgProd', 'Empresas', 'Empresas\\Fotos'];
const FOTO_EXTS = ['.jpg', '.jpeg', '.png', '.bmp', '.gif'];
const CACHE_DIR = path.resolve('data/syntech-fotos');

export type SyntechProdutoFoto = {
  buffer: Buffer;
  mime: string;
  md5: string;
};

let cachedDir: string | null = null;
let cachedCaminho = '';
let noShareUntil = 0;

function fbStr(value: unknown) {
  if (value == null) return '';
  if (Buffer.isBuffer(value)) return value.toString('latin1').trim();
  return String(value).trim();
}

function mimeOf(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.bmp') return 'image/bmp';
  if (ext === '.webp') return 'image/webp';
  return 'image/jpeg';
}

function probeTcp(host: string, port: number, ms = 1200): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(ms);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    try {
      socket.connect(port, host);
    } catch {
      finish(false);
    }
  });
}

function existsQuick(dir: string, ms = 800): Promise<boolean> {
  return Promise.race([
    fs.promises
      .stat(dir)
      .then((st) => st.isDirectory() || st.isFile())
      .catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), ms)),
  ]);
}

function joinDir(...parts: string[]) {
  return parts
    .map((part, index) => {
      const text = String(part ?? '').trim();
      if (!text) return '';
      if (index === 0) return text.replace(/[/\\]+$/, '');
      return text.replace(/^[/\\]+/, '').replace(/[/\\]+$/, '');
    })
    .filter(Boolean)
    .join('\\');
}

function rewriteHost(unc: string, host: string) {
  return unc.replace(/^\\\\[^\\]+\\/, `\\\\${host}\\`);
}

async function baseDirs(caminhoFotos: string) {
  const out: string[] = [];
  const add = (dir: string) => {
    const item = dir.trim();
    if (item && !out.includes(item)) out.push(item);
  };

  const envDir = String(process.env.SYNTECH_FOTOS_DIR ?? '').trim();
  if (envDir) add(envDir);

  const raw = caminhoFotos.replace(/[/\\]+$/, '') || '\\\\RENATA\\Textil';
  add(raw);
  for (const host of FOTO_HOSTS) add(rewriteHost(raw, host));

  const dbPath = syntechFbConfig().database;
  if (dbPath && /^[A-Za-z]:\\/.test(dbPath)) {
    add(path.dirname(dbPath));
    add(path.dirname(path.dirname(dbPath)));
  }

  const reachable: string[] = [];
  for (const dir of out) {
    const unc = dir.match(/^\\\\([^\\]+)\\/);
    if (unc) {
      const ok = await probeTcp(unc[1], 445, 500);
      if (!ok) continue;
    }
    if (await existsQuick(dir, 700)) reachable.push(dir);
  }
  if (!reachable.length) {
    console.warn('Syntech fotos: pasta não aparece neste PC', out.join(' | '));
  }
  return reachable;
}

function fileNames(codigo: string, md5: string) {
  const names = new Set<string>();
  const codes = [codigo, codigo.replace(/^0+/, '')].filter(Boolean);
  if (/^\d+$/.test(codigo) && codigo.length < 4) codes.push(codigo.padStart(4, '0'));
  for (const code of codes) {
    for (const ext of FOTO_EXTS) names.add(`${code}${ext}`);
  }
  if (md5) {
    for (const ext of FOTO_EXTS) names.add(`${md5}${ext}`);
  }
  return [...names];
}

function tryRead(dir: string, names: string[]): SyntechProdutoFoto | null {
  for (const sub of FOTO_SUBS) {
    const folder = sub ? joinDir(dir, sub) : dir;
    for (const name of names) {
      const full = joinDir(folder, name);
      try {
        if (!fs.existsSync(full)) continue;
        const buffer = fs.readFileSync(full);
        if (buffer.length < 40) continue;
        cachedDir = folder;
        return { buffer, mime: mimeOf(full), md5: '' };
      } catch {
        /* arquivo travado ou sem permissão */
      }
    }
  }
  return null;
}

function readCache(names: string[]): SyntechProdutoFoto | null {
  try {
    if (!fs.existsSync(CACHE_DIR)) return null;
  } catch {
    return null;
  }
  for (const name of names) {
    const full = path.join(CACHE_DIR, name);
    try {
      if (!fs.existsSync(full)) continue;
      const buffer = fs.readFileSync(full);
      if (buffer.length < 40) continue;
      return { buffer, mime: mimeOf(full), md5: '' };
    } catch {
      /* cache travado */
    }
  }
  return null;
}

export function saveSyntechFotoCache(codigo: string, foto: SyntechProdutoFoto) {
  const ref = clipSyntechText(codigo, 13);
  if (!ref || !foto.buffer.length) return;
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const ext = foto.mime.includes('png') ? '.png' : foto.mime.includes('gif') ? '.gif' : '.jpg';
    fs.writeFileSync(path.join(CACHE_DIR, `${ref}${ext}`), foto.buffer);
  } catch (err) {
    console.warn('Syntech fotos: nao gravou copia local', err instanceof Error ? err.message : err);
  }
}

export async function findSyntechProdutoFoto(codigoRaw: string): Promise<SyntechProdutoFoto | null> {
  const codigo = clipSyntechText(String(codigoRaw ?? '').trim(), 13);
  if (!codigo) return null;

  const db = await attachSyntechDb();
  let caminho = cachedCaminho;
  let md5 = '';
  try {
    if (!caminho) {
      const agente = await queryDb<{ CAMINHO_FOTOS: unknown }>(db, 'SELECT FIRST 1 CAMINHO_FOTOS FROM AGENTE');
      caminho = fbStr(agente[0]?.CAMINHO_FOTOS);
      cachedCaminho = caminho;
    }
    const rows = await queryDb<{ MD5_FOTO: unknown }>(
      db,
      `SELECT FIRST 1 CAST(MD5_FOTO AS VARCHAR(50)) AS MD5_FOTO
       FROM PRODUTOS
       WHERE TRIM(CAST(CODIGO AS VARCHAR(13))) = ?`,
      [codigo]
    );
    md5 = fbStr(rows[0]?.MD5_FOTO);
  } finally {
    await detachDb(db);
  }

  const names = fileNames(codigo, md5);
  const cached = readCache(names);
  if (cached) return { ...cached, md5 };

  if (Date.now() < noShareUntil && !cachedDir) return null;

  if (cachedDir) {
    for (const name of names) {
      const full = joinDir(cachedDir, name);
      try {
        if (!fs.existsSync(full)) continue;
        const buffer = fs.readFileSync(full);
        if (buffer.length < 40) continue;
        const hit = { buffer, mime: mimeOf(full), md5 };
        saveSyntechFotoCache(codigo, hit);
        return hit;
      } catch {
        /* arquivo travado ou sem permissão */
      }
    }
  }

  for (const dir of await baseDirs(caminho)) {
    const hit = tryRead(dir, names);
    if (hit) {
      noShareUntil = 0;
      const found = { ...hit, md5 };
      saveSyntechFotoCache(codigo, found);
      return found;
    }
  }
  if (!cachedDir) noShareUntil = Date.now() + 60_000;
  return null;
}
