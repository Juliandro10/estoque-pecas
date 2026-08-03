import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOTS = [
  'H:\\Outros computadores\\Desenvolvimento\\PROGRAMAS\\PROGRAMAS-POR-CLIENTE',
  'G:\\Outros computadores\\Meu computador\\PROGRAMAS-HOME',
  'C:\\Users\\Tricot&Cia\\Desktop\\PROGRAMAS',
];

function loadEnvFile() {
  try {
    const raw = fs.readFileSync(path.resolve('.env'), 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // .env opcional
  }
}

loadEnvFile();

function parseConfiguredRoots(): string[] {
  const multi = process.env.PROGRAMS_ROOTS?.trim();
  if (multi) {
    return multi
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  const single = process.env.PROGRAMS_ROOT?.trim();
  if (single) return [single];

  return DEFAULT_ROOTS;
}

export function getConfiguredProgramsRoots(): string[] {
  return parseConfiguredRoots().map((root) => path.resolve(root));
}

export function getProgramsRoots(): string[] {
  return getConfiguredProgramsRoots().filter((root) => fs.existsSync(root));
}

export function formatProgramsRootsLabel(roots: string[]) {
  return roots.join(' ; ');
}

export function requireProgramsRoots(): string[] {
  const roots = getProgramsRoots();
  if (roots.length > 0) return roots;

  throw new Error(`Pasta de programas não encontrada: ${formatProgramsRootsLabel(getConfiguredProgramsRoots())}`);
}

export function isUnderProgramsRoot(target: string, roots = getProgramsRoots()) {
  const resolved = path.resolve(target);
  return roots.some((root) => resolved === root || resolved.startsWith(`${root}${path.sep}`));
}
