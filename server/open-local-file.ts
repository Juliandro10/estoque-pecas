import { spawn } from 'node:child_process';

/** Abre arquivo com o app padrão do sistema (ex.: leitor de PDF). */
export function openLocalFile(filePath: string) {
  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', filePath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  if (process.platform === 'darwin') {
    spawn('open', [filePath], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn('xdg-open', [filePath], { detached: true, stdio: 'ignore' }).unref();
}
