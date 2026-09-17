import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logsDir = path.join(root, 'logs');
const logFile = path.join(logsDir, 'vigia.log');
const pidFile = path.join(logsDir, 'servico.pid');
const npmCmd = path.join(path.dirname(process.execPath), 'npm.cmd');

function log(msg) {
  const line = `[${new Date().toLocaleString('pt-BR')}] ${msg}\n`;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, line);
  } catch {
    /* log trancado por outro processo — segue no console */
  }
  process.stdout.write(line);
}

function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function alreadyRunning() {
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf8').trim());
    return Boolean(pid) && pid !== process.pid && pidAlive(pid);
  } catch {
    return false;
  }
}

if (alreadyRunning()) {
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

const children = { web: null, scan: null };

function start(key, label, script) {
  log(`Subindo ${label}`);
  const child = spawn(npmCmd, ['run', script], {
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
  child.on('exit', (code, signal) => {
    log(`${label} saiu (codigo ${code ?? signal ?? '?'})`);
    if (children[key] === child) children[key] = null;
  });
  children[key] = child;
}

async function tick() {
  if (!(await portOpen(3847)) && !children.web) start('web', 'Vite :3847', 'dev');
  if (!(await portOpen(3848)) && !children.scan) start('scan', 'scanner :3848', 'scanner');
}

log('Vigia local ligado (Vite 3847 + scanner 3848).');
await tick();
setInterval(() => {
  void tick();
}, 20000);
