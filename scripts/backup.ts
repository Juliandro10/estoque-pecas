import { resolve } from 'node:path';

import { runBackup } from './lib/run-backup';

function parseArgs() {
  const args = process.argv.slice(2);
  let outDir = resolve('backups');
  let keep = 30;
  let skipZip = false;
  let skipFirestore = false;
  let skipLocal = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--out' && args[i + 1]) {
      outDir = resolve(args[++i]);
    } else if (arg === '--keep' && args[i + 1]) {
      keep = Math.max(1, Number(args[++i]) || 30);
    } else if (arg === '--no-zip') {
      skipZip = true;
    } else if (arg === '--local-only') {
      skipFirestore = true;
    } else if (arg === '--firestore-only') {
      skipLocal = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`Uso: npm run backup [-- --out <pasta>] [--keep <n>] [--no-zip] [--local-only] [--firestore-only]

  --out <pasta>     Destino dos backups (padrão: ./backups)
  --keep <n>        Quantidade de backups a manter (padrão: 30)
  --no-zip          Não gera arquivo .zip
  --local-only      Só copia arquivos locais (data/)
  --firestore-only  Só exporta Firestore`);
      process.exit(0);
    }
  }

  return { outDir, keep, skipZip, skipFirestore, skipLocal };
}

async function main() {
  const opts = parseArgs();
  const result = await runBackup({
    ...opts,
    log: (message) => console.log(`  ${message}`),
  });

  console.log('');
  console.log('Backup concluído.');
  if (result.zip_path) console.log(`  Arquivo: ${result.zip_path}`);
  else if (result.backup_dir) console.log(`  Pasta: ${result.backup_dir}`);
  console.log(`  Manifest: ${result.manifest_path}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
