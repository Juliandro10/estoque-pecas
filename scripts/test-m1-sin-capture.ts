import '../server/block-model-root-writes.ts';

import fs from 'node:fs';

import { DADOS_PROGRAMA_DIR, listSintralDados } from '../server/sintral-capture.ts';
import { scanM1SinCaptures } from '../server/m1-sin-capture.ts';

const tmpDir = process.env.STOLL_TMP ?? 'C:/Stoll/Tmp';
const programsRoot =
  process.env.PROGRAMS_ROOT ?? 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS';
const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';

const scan = scanM1SinCaptures(tmpDir, programsRoot, 24 * 60 * 60 * 1000);
console.log('scan', scan);

const dados = listSintralDados(folder);
console.log('\ndados do programa em', dados.root);
for (const part of dados.parts) {
  console.log(' ', part.part_base, part.files.join(', ') || '(vazio)');
}

const rootExists = fs.existsSync(`${folder}/${DADOS_PROGRAMA_DIR}`);
console.log('\npasta criada?', rootExists ? 'sim' : 'nao — processe a parte no M1 com Iniciar.bat aberto');
