import fs from 'node:fs';
import path from 'node:path';

const PROGRAMS_ROOT = path.resolve(
  process.env.PROGRAMS_ROOT ?? 'C:\\Users\\Tricot&Cia\\Desktop\\PROGRAMAS'
);
const DADOS_PROGRAMA_DIR = 'dados do programa';
const BLOCKED_EXT = /\.(sin|setx|simx|jac|cfgx|wkt)$/i;

function isBlockedProgramsWrite(target: string) {
  const resolved = path.resolve(target);
  if (!BLOCKED_EXT.test(resolved)) return false;
  if (!resolved.startsWith(PROGRAMS_ROOT + path.sep)) return false;

  const rel = path.relative(PROGRAMS_ROOT, resolved);
  const parts = rel.split(/[\\/]/);
  const dadosIdx = parts.findIndex((p) => p.toLowerCase() === DADOS_PROGRAMA_DIR.toLowerCase());

  if (dadosIdx < 0) return true;
  return parts.length <= dadosIdx + 1;
}

function guardTarget(target: string, op: string) {
  if (!isBlockedProgramsWrite(target)) return;
  throw new Error(`[scanner] ${op} bloqueado fora de dados do programa/{{parte}}/: ${target}`);
}

function patchFs() {
  const copyFileSync = fs.copyFileSync.bind(fs);
  const writeFileSync = fs.writeFileSync.bind(fs);
  const renameSync = fs.renameSync.bind(fs);
  const cpSync = fs.cpSync?.bind(fs);

  fs.copyFileSync = (src, dest, ...args) => {
    guardTarget(String(dest), 'copyFileSync');
    return copyFileSync(src, dest, ...args);
  };

  fs.writeFileSync = (file, ...args) => {
    guardTarget(String(file), 'writeFileSync');
    return writeFileSync(file, ...args);
  };

  fs.renameSync = (oldPath, newPath) => {
    guardTarget(String(newPath), 'renameSync');
    return renameSync(oldPath, newPath);
  };

  if (cpSync) {
    fs.cpSync = (src, dest, ...args) => {
      guardTarget(String(dest), 'cpSync');
      return cpSync(src, dest, ...args);
    };
  }
}

patchFs();
