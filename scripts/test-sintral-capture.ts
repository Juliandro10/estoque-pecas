import '../server/block-model-root-writes.ts';

import { scanM1SinCaptures } from '../server/m1-sin-capture.ts';

const tmpDir = process.env.STOLL_TMP ?? 'C:/Stoll/Tmp';
const programsRoot =
  process.env.PROGRAMS_ROOT ?? 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS';

const scan = scanM1SinCaptures(tmpDir, programsRoot, 24 * 60 * 60 * 1000);
console.log('scan', scan);
