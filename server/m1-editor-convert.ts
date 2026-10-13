import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveInside } from './m1-editor-store';

const RASTER_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.tif', '.tiff', '.bmp', '.svg']);

type SharpModule = typeof import('sharp');

let sharpMod: Promise<SharpModule> | null = null;
function loadSharp() {
  sharpMod ??= import('sharp');
  return sharpMod;
}

let psdReady: Promise<void> | null = null;
function ensurePsd() {
  psdReady ??= (async () => {
    const canvas = await import('@napi-rs/canvas');
    const ag = await import('ag-psd');
    ag.initializeCanvas(canvas.createCanvas as unknown as (width: number, height: number) => HTMLCanvasElement);
  })();
  return psdReady;
}

function clampByte(n: number) {
  return Math.max(0, Math.min(255, Math.round(n)));
}

export function writeBmp24(filePath: string, width: number, height: number, rgb: Buffer) {
  if (rgb.length < width * height * 3) throw new Error('Buffer da imagem incompleto.');
  const rowStride = width * 3;
  const pad = (4 - (rowStride % 4)) % 4;
  const rowSize = rowStride + pad;
  const pixelSize = rowSize * height;
  const fileSize = 54 + pixelSize;
  const buf = Buffer.alloc(fileSize);
  buf.write('BM', 0);
  buf.writeUInt32LE(fileSize, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y += 1) {
    const src = (height - 1 - y) * rowStride;
    const dst = 54 + y * rowSize;
    for (let x = 0; x < width; x += 1) {
      const i = src + x * 3;
      const o = dst + x * 3;
      buf[o] = rgb[i + 2] ?? 0;
      buf[o + 1] = rgb[i + 1] ?? 0;
      buf[o + 2] = rgb[i] ?? 0;
    }
  }
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, buf);
  fs.copyFileSync(tmp, filePath);
  fs.rmSync(tmp, { force: true });
}

function relPosix(root: string, filePath: string) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function uniquePath(filePath: string) {
  if (!fs.existsSync(filePath)) return filePath;
  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const stem = path.basename(filePath, ext);
  for (let i = 2; i < 100; i += 1) {
    const next = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(next)) return next;
  }
  throw new Error('Muitos arquivos com o mesmo nome.');
}

export function readBmpRgb(buf: Buffer) {
  if (buf.toString('ascii', 0, 2) !== 'BM') throw new Error('BMP inválido.');
  const offset = buf.readUInt32LE(10);
  const width = buf.readInt32LE(18);
  let height = buf.readInt32LE(22);
  const bpp = buf.readUInt16LE(28);
  const compression = buf.readUInt32LE(30);
  if (compression !== 0) throw new Error('BMP compactado não entra. Use 24 bits sem compressão.');
  if (bpp !== 24 && bpp !== 32) throw new Error(`BMP de ${bpp} bits. Use 24 ou 32.`);
  const bottomUp = height > 0;
  height = Math.abs(height);
  if (width <= 0 || height <= 0) throw new Error('BMP sem medida.');
  const rgb = Buffer.alloc(width * height * 3);
  const bytesPerPixel = bpp / 8;
  const srcStride = Math.floor((bpp * width + 31) / 32) * 4;
  for (let y = 0; y < height; y += 1) {
    const srcY = bottomUp ? height - 1 - y : y;
    const src = offset + srcY * srcStride;
    for (let x = 0; x < width; x += 1) {
      const i = src + x * bytesPerPixel;
      const o = (y * width + x) * 3;
      rgb[o] = buf[i + 2] ?? 0;
      rgb[o + 1] = buf[i + 1] ?? 0;
      rgb[o + 2] = buf[i] ?? 0;
    }
  }
  return { rgb, width, height };
}

function isBmp(input: Buffer | string) {
  if (typeof input === 'string') return path.extname(input).toLowerCase() === '.bmp';
  return input.subarray(0, 2).toString('ascii') === 'BM';
}

async function rgbFromSharp(input: Buffer | string, width?: number, height?: number, pixel = true) {
  const sharp = (await loadSharp()).default;
  let pipeline;
  if (isBmp(input)) {
    const buf = typeof input === 'string' ? fs.readFileSync(input) : input;
    const decoded = readBmpRgb(buf);
    pipeline = sharp(decoded.rgb, { raw: { width: decoded.width, height: decoded.height, channels: 3 } });
  } else {
    pipeline = sharp(input, { limitInputPixels: false, density: 144 });
  }
  if (width || height) {
    pipeline = pipeline.resize(width, height, {
      fit: width && height ? 'fill' : 'inside',
      kernel: pixel ? 'nearest' : 'lanczos3',
      withoutEnlargement: false,
    });
  }
  const { data, info } = await pipeline.removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgb: data, width: info.width, height: info.height };
}

async function writeRaster(filePath: string, rgb: Buffer, width: number, height: number) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.bmp') {
    writeBmp24(filePath, width, height, rgb);
    return;
  }
  const sharp = (await loadSharp()).default;
  let pipeline = sharp(rgb, { raw: { width, height, channels: 3 } });
  if (ext === '.jpg' || ext === '.jpeg') pipeline = pipeline.jpeg({ quality: 95 });
  else if (ext === '.webp') pipeline = pipeline.webp();
  else if (ext === '.tif' || ext === '.tiff') pipeline = pipeline.tiff();
  else pipeline = pipeline.png();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  await pipeline.toFile(filePath);
}

function isPdfBuffer(buf: Buffer) {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return true;
  const head = buf.subarray(0, Math.min(buf.length, 1024 * 512)).toString('latin1');
  return head.includes('%PDF-');
}

async function renderPdf(buffer: Buffer, pageNumber: number, width?: number) {
  const mupdf = await import('mupdf');
  const doc = mupdf.Document.openDocument(buffer, 'application/pdf');
  const count = doc.countPages();
  const index = Math.max(0, Math.min(count - 1, pageNumber - 1));
  const page = doc.loadPage(index);
  const bounds = page.getBounds();
  const pageW = Math.max(1, bounds[2] - bounds[0]);
  const zoom = width && width > 0 ? width / pageW : 2;
  const pixmap = page.toPixmap(mupdf.Matrix.scale(zoom, zoom), mupdf.ColorSpace.DeviceRGB, false);
  const png = Buffer.from(pixmap.asPNG());
  page.destroy?.();
  doc.destroy?.();
  return { png, pages: count, page: index + 1 };
}

function decodePackRow(src: Buffer, start: number, length: number, expected: number) {
  const out = Buffer.alloc(expected);
  let i = start;
  const end = start + length;
  let o = 0;
  while (i < end && o < expected) {
    const n = src.readInt8(i);
    i += 1;
    if (n >= 0) {
      const count = Math.min(n + 1, expected - o, end - i);
      src.copy(out, o, i, i + count);
      i += count;
      o += count;
    } else if (n !== -128) {
      const count = Math.min(1 - n, expected - o);
      out.fill(src[i] ?? 0, o, o + count);
      i += 1;
      o += count;
    }
  }
  return out;
}

function readPsdComposite(buf: Buffer) {
  if (buf.toString('ascii', 0, 4) !== '8BPS') throw new Error('Não é um arquivo do Photoshop.');
  if (buf.readUInt16BE(4) !== 1) throw new Error('Arquivo PSB. Exporte como PSD.');
  const channels = buf.readUInt16BE(12);
  const height = buf.readUInt32BE(14);
  const width = buf.readUInt32BE(18);
  const depth = buf.readUInt16BE(22);
  const mode = buf.readUInt16BE(24);
  if (depth !== 8) throw new Error('Photoshop com profundidade diferente de 8 bits.');
  if (mode !== 3 && mode !== 4) throw new Error('Esse Photoshop não é RGB nem CMYK.');
  if (mode === 4 && channels < 4) throw new Error('CMYK incompleto.');
  let off = 26;
  for (let section = 0; section < 3; section += 1) {
    const len = buf.readUInt32BE(off);
    off += 4 + len;
  }
  const compression = buf.readUInt16BE(off);
  off += 2;
  const planeSize = width * height;
  const planes = Buffer.alloc(channels * planeSize);
  if (compression === 0) {
    for (let c = 0; c < channels; c += 1) {
      buf.copy(planes, c * planeSize, off, off + planeSize);
      off += planeSize;
    }
  } else if (compression === 1) {
    const rows = channels * height;
    const counts = new Array<number>(rows);
    for (let i = 0; i < rows; i += 1) {
      counts[i] = buf.readUInt16BE(off);
      off += 2;
    }
    let row = 0;
    for (let c = 0; c < channels; c += 1) {
      for (let y = 0; y < height; y += 1) {
        const len = counts[row] ?? 0;
        row += 1;
        decodePackRow(buf, off, len, width).copy(planes, c * planeSize + y * width);
        off += len;
      }
    }
  } else {
    throw new Error('Compressão do Photoshop não suportada.');
  }

  const rgb = Buffer.alloc(planeSize * 3);
  for (let i = 0; i < planeSize; i += 1) {
    if (mode === 3) {
      rgb[i * 3] = planes[i] ?? 0;
      rgb[i * 3 + 1] = planes[planeSize + i] ?? 0;
      rgb[i * 3 + 2] = planes[planeSize * 2 + i] ?? 0;
    } else {
      const cyan = planes[i] ?? 0;
      const magenta = planes[planeSize + i] ?? 0;
      const yellow = planes[planeSize * 2 + i] ?? 0;
      const black = planes[planeSize * 3 + i] ?? 0;
      rgb[i * 3] = Math.round((cyan * black) / 255);
      rgb[i * 3 + 1] = Math.round((magenta * black) / 255);
      rgb[i * 3 + 2] = Math.round((yellow * black) / 255);
    }
  }
  return { rgb, width, height };
}

async function pngFromRaw(rgb: Buffer, width: number, height: number) {
  const sharp = (await loadSharp()).default;
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

async function flattenPsd(buffer: Buffer) {
  const mode = buffer.toString('ascii', 0, 4) === '8BPS' ? buffer.readUInt16BE(24) : 0;
  if (mode === 4) {
    const image = readPsdComposite(buffer);
    return pngFromRaw(image.rgb, image.width, image.height);
  }
  await ensurePsd();
  const { readPsd } = await import('ag-psd');
  const psd = readPsd(buffer);
  const canvas = (psd as { canvas?: { toBuffer: (mime: string) => Buffer; width: number; height: number } }).canvas;
  if (canvas?.toBuffer) {
    return canvas.toBuffer('image/png');
  }
  const imageData = (psd as { imageData?: { width: number; height: number; data: Uint8ClampedArray } }).imageData;
  if (!imageData) throw new Error('O Photoshop não trouxe a imagem achatada.');
  const { width, height, data } = imageData;
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = (data[i + 3] ?? 255) / 255;
    rgb[j] = clampByte((data[i] ?? 0) * a + 255 * (1 - a));
    rgb[j + 1] = clampByte((data[i + 1] ?? 0) * a + 255 * (1 - a));
    rgb[j + 2] = clampByte((data[i + 2] ?? 0) * a + 255 * (1 - a));
  }
  const sharp = (await loadSharp()).default;
  return sharp(rgb, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

function browserBinary() {
  const candidates = [
    path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(process.env.PROGRAMFILES ?? 'C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env['PROGRAMFILES(X86)'] ?? 'C:\\Program Files (x86)', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ];
  return candidates.find((file) => fs.existsSync(file)) ?? null;
}

function screenshotHtml(target: string, outPng: string) {
  const bin = browserBinary();
  if (!bin) throw new Error('Não achei o Edge nem o Chrome para converter HTML.');
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-html-'));
  return new Promise<void>((resolve, reject) => {
    const child = spawn(
      bin,
      [
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        `--user-data-dir=${profile}`,
        '--window-size=1400,1800',
        `--screenshot=${outPng}`,
        target,
      ],
      { windowsHide: true }
    );
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('A conversão do HTML passou de 25 segundos.'));
    }, 25000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      if (fs.existsSync(outPng)) resolve();
      else reject(new Error(`O navegador não gerou a imagem (código ${code ?? '—'}).`));
    });
  }).finally(() => {
    fs.rmSync(profile, { recursive: true, force: true });
  });
}

export async function previewPng(filePath: string) {
  const decoded = await rgbFromSharp(filePath);
  const sharp = (await loadSharp()).default;
  return sharp(decoded.rgb, { raw: { width: decoded.width, height: decoded.height, channels: 3 } })
    .resize(1400, 1400, { fit: 'inside', withoutEnlargement: true })
    .png()
    .toBuffer();
}

function parseColors(raw: unknown) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Informe as cores do fio, como 138,92,49.');
  const colors: [number, number, number][] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const parts = item.split(/[,\s]+/).map((n) => Number(n));
    if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) continue;
    colors.push([clampByte(parts[0] ?? 0), clampByte(parts[1] ?? 0), clampByte(parts[2] ?? 0)]);
  }
  if (colors.length === 0) throw new Error('Nenhuma cor válida. Use r,g,b.');
  return colors;
}

export async function describeImage(root: string, entrada: string) {
  const full = resolveInside(root, entrada);
  if (!fs.existsSync(full)) throw new Error('Arquivo não encontrado.');
  const ext = path.extname(full).toLowerCase();
  const buf = fs.readFileSync(full);
  if (ext === '.pdf' || ext === '.ai' || isPdfBuffer(buf.subarray(0, Math.min(buf.length, 64)))) {
    if (!isPdfBuffer(buf)) throw new Error('Este arquivo não tem um PDF dentro.');
    const mupdf = await import('mupdf');
    const doc = mupdf.Document.openDocument(buf, 'application/pdf');
    const pages = doc.countPages();
    const page = doc.loadPage(0);
    const bounds = page.getBounds();
    page.destroy?.();
    doc.destroy?.();
    return `PDF com ${pages} página(s). Página 1: ${Math.round(bounds[2] - bounds[0])} x ${Math.round(bounds[3] - bounds[1])} pontos.`;
  }
  const { width, height } = await rgbFromSharp(full);
  return `${path.basename(full)}: ${width} x ${height} pixels. Linha 1 de baixo = y ${height - 1}. Linha N de baixo = y ${height} - N.`;
}

export async function converterParaImagem(
  root: string,
  args: {
    entrada: string;
    saida?: string;
    largura?: number;
    altura?: number;
    pagina?: number;
    pixel?: boolean;
  }
) {
  const entrada = args.entrada.trim();
  const isUrl = /^https?:\/\//i.test(entrada);
  const ext = isUrl ? '.html' : path.extname(entrada).toLowerCase();
  const stem = isUrl ? 'pagina' : path.basename(entrada, path.extname(entrada));
  const saidaRel = (args.saida ?? `arquivos/${stem}.bmp`).trim();
  let outPath = uniquePath(resolveInside(root, saidaRel));

  let sourcePng: Buffer | null = null;
  let note = '';

  if (isUrl || ext === '.html' || ext === '.htm') {
    const target = isUrl ? entrada : pathToFileURL(resolveInside(root, entrada)).href;
    const tmp = path.join(os.tmpdir(), `m1-html-${Date.now()}.png`);
    await screenshotHtml(target, tmp);
    sourcePng = fs.readFileSync(tmp);
    fs.rmSync(tmp, { force: true });
    note = 'HTML convertido.';
  } else {
    const full = resolveInside(root, entrada);
    if (!fs.existsSync(full)) throw new Error('Arquivo não encontrado.');
    const buf = fs.readFileSync(full);
    if (ext === '.psd' || ext === '.psb') {
      sourcePng = await flattenPsd(buf);
      note = 'Photoshop achatado.';
    } else if (ext === '.pdf' || ext === '.ai' || isPdfBuffer(buf)) {
      if (!isPdfBuffer(buf)) throw new Error('Este .ai não tem PDF embutido.');
      const rendered = await renderPdf(buf, args.pagina ?? 1, args.altura ? undefined : args.largura);
      sourcePng = rendered.png;
      note = `Página ${rendered.page} de ${rendered.pages}.`;
    } else if (RASTER_EXT.has(ext)) {
      sourcePng = null;
      const raster = await rgbFromSharp(full, args.largura, args.altura, args.pixel !== false);
      await writeRaster(outPath, raster.rgb, raster.width, raster.height);
      return `${relPosix(root, outPath)} — ${raster.width} x ${raster.height} pixels.`;
    } else {
      throw new Error(`Formato ${ext || 'desconhecido'} sem conversor.`);
    }
  }

  const raster = await rgbFromSharp(sourcePng!, args.largura, args.altura, args.pixel !== false);
  if (path.extname(outPath).toLowerCase() === '' ) outPath += '.bmp';
  await writeRaster(outPath, raster.rgb, raster.width, raster.height);
  return `${note} ${relPosix(root, outPath)} — ${raster.width} x ${raster.height} pixels.`.trim();
}

export async function quantizarCores(root: string, entrada: string, saida: string, coresRaw: unknown) {
  const colors = parseColors(coresRaw);
  const full = resolveInside(root, entrada);
  const raster = await rgbFromSharp(full);
  const { rgb, width, height } = raster;
  for (let i = 0; i < rgb.length; i += 3) {
    const r = rgb[i] ?? 0;
    const g = rgb[i + 1] ?? 0;
    const b = rgb[i + 2] ?? 0;
    let best = colors[0]!;
    let bestD = Infinity;
    for (const color of colors) {
      const d = (r - color[0]) ** 2 + (g - color[1]) ** 2 + (b - color[2]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = color;
      }
    }
    rgb[i] = best[0];
    rgb[i + 1] = best[1];
    rgb[i + 2] = best[2];
  }
  const outPath = uniquePath(resolveInside(root, saida));
  await writeRaster(outPath, rgb, width, height);
  return `${relPosix(root, outPath)} — ${width} x ${height}, ${colors.length} cores.`;
}
