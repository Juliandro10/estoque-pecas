import fs from 'node:fs';
import path from 'node:path';

type SyntechType = {
  codigo: number;
  tipo: string;
  cores: string[];
};

type CatalogFile = {
  updated_at?: string;
  source?: string;
  types: SyntechType[];
};

const catalogPath = path.join(process.cwd(), 'data', 'syntech-fios.json');
const outPath = path.join(process.cwd(), 'docs', 'syntech-fios-codigos.md');

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as CatalogFile;
const types = [...catalog.types].sort((a, b) => a.codigo - b.codigo || a.tipo.localeCompare(b.tipo, 'pt-BR'));

const updated = catalog.updated_at
  ? new Date(catalog.updated_at).toLocaleString('pt-BR')
  : '—';

const lines: string[] = [
  '# Códigos de fios Syntech',
  '',
  `Catálogo exportado de \`${catalog.source ?? 'FABRICA.MDB'}\` · atualizado em ${updated}.`,
  '',
  'No cadastro, você pode usar o código direto na descrição do fio, por exemplo:',
  '',
  '- `Codigo 44 - York Soft 3 CABOS TOMATE`',
  '- `44 - York Soft 3 CABOS TOMATE`',
  '- `Codigo 44 - TOMATE`',
  '',
  'O painel reconhece o **código** e usa o tipo cadastrado no Syntech (ex.: 44 = YORK/SAVANA), mesmo que o nome escrito seja diferente.',
  '',
  '## Resumo',
  '',
  '| Cód | Tipo Syntech | Qtd cores |',
  '| ---: | --- | ---: |',
];

for (const item of types) {
  lines.push(`| ${item.codigo} | ${item.tipo.replace(/\|/g, '\\|')} | ${item.cores.length} |`);
}

lines.push('', '## Detalhe por código', '');

for (const item of types) {
  lines.push(`### ${item.codigo} — ${item.tipo}`, '');
  if (item.cores.length === 0) {
    lines.push('_Sem cores cadastradas._', '');
    continue;
  }
  lines.push(item.cores.join(', '), '');
}

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`, 'utf8');
console.log(`Lista gerada: ${outPath} (${types.length} tipos)`);
