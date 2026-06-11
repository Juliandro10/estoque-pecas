import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { readCfgxSecondsFromText } from '../server/cfgx-io.ts';
import { readM1TimeForPart } from '../server/stoll-time.ts';

const folder =
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/ANIMALE/5469-POLO-LISTRADA-VITORIA';
const partFile = '5469-POLO-LISTRADA-VITORIA-CT.mdv';
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'm1-cfgx-test-'));

const cfgxBody = `<?xml version="1.0" encoding="UTF-8"?>
<report>
  <pattern type="mdv">5469-POLO-LISTRADA-VITORIA-CT.mdv</pattern>
  <knittingTimeSeconds>671</knittingTimeSeconds>
</report>`;

const cfgxPath = path.join(folder, '5469-POLO-LISTRADA-VITORIA-CT.cfgx');
fs.writeFileSync(cfgxPath, cfgxBody, 'utf8');

const parsed = readCfgxSecondsFromText(cfgxBody);
console.log('cfgx parser', parsed === 671 ? 'OK' : 'FAIL', parsed);

try {
  const result = readM1TimeForPart(tmpDir, partFile, folder);
  console.log('read part', result.time_mmss, result.source, result.seconds === 671 ? 'OK' : 'FAIL');
} finally {
  fs.rmSync(cfgxPath, { force: true });
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
