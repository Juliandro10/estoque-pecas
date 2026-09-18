import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = path.join(root, 'logs');
const logFile = path.join(logsDir, 'vigia.log');
const pidFile = path.join(logsDir, 'servico.pid');
const lockPort = 3846;
const nodeExe = process.execPath;
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const tsxBin = path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const scannerFile = path.join(root, 'server', 'programs-scanner.ts');

function log(msg) {
  const line = `[${new Date().toLocaleString('pt-BR')}] ${msg}\n`;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    /* log trancado por outro processo — segue no console */
  }
  try {
    process.stdout.write(line);
  } catch {
    /* sem console (janela oculta) */
  }
}

function occupyLock() {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.on('error', () => resolve(false));
    server.listen(lockPort, '127.0.0.1', () => resolve(true));
  });
}

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => {
      socket.end();
      resolve(true);
    });
    socket.setTimeout(800, () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

if (!(await occupyLock())) {
  log('Vigia local ja esta rodando. Saindo.');
  process.exit(0);
}

fs.mkdirSync(logsDir, { recursive: true });
fs.writeFileSync(pidFile, String(process.pid));
const clearPid = () => {
  try {
    if (fs.readFileSync(pidFile, 'utf8').trim() === String(process.pid)) fs.unlinkSync(pidFile);
  } catch {
    /* ignore */
  }
};
process.on('exit', clearPid);
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));

const children = { web: null, scan: null };

function start(key, label, args) {
  if (!fs.existsSync(args[0])) {
    log(`${label} nao encontrado: ${args[0]}`);
    return;
  }
  log(`Subindo ${label}`);
  const child = spawn(nodeExe, args, {
    cwd: root,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });
  const pipe = (buf) => {
    try {
      fs.appendFileSync(logFile, buf);
    } catch {
      /* ignore */
    }
  };
  child.stdout?.on('data', pipe);
  child.stderr?.on('data', pipe);
  child.on('error', (err) => {
    log(`${label} falhou ao iniciar: ${err.message}`);
    if (children[key] === child) children[key] = null;
  });
  child.on('exit', (code, signal) => {
    log(`${label} saiu (codigo ${code ?? signal ?? '?'})`);
    if (children[key] === child) children[key] = null;
  });
  children[key] = child;
}

async function tick() {
  if (!(await portOpen(3847)) && !children.web) {
    start('web', 'Vite :3847', [viteBin]);
  }
  if (!(await portOpen(3848)) && !children.scan) {
    start('scan', 'scanner :3848', [tsxBin, scannerFile]);
  }
}

log(`Vigia local ligado (node ${nodeExe}). Vite 3847 + scanner 3848.`);
await tick();
setInterval(() => {
  void tick();
}, 8000);
