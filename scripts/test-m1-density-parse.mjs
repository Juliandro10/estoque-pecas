import fs from 'node:fs';

import { parseKnittingWidthFromSin } from '../server/sin-knitting-width.ts';
import { parseCoursesFromSimx } from '../server/simx-courses.ts';
import { parseYarnGuidesFromSin } from '../server/sin-yarn.ts';

function productionLetters(sinText) {
  const parsed = parseYarnGuidesFromSin(sinText);
  const letters = new Set();
  for (const yarn of parsed.guides) {
    if (yarn.guide > 2 && yarn.letter) letters.add(yarn.letter);
  }
  return letters;
}

function run(label, sinPath, simxPath) {
  const sin = fs.readFileSync(sinPath, 'utf8');
  const simx = fs.readFileSync(simxPath, 'utf8');
  const width = parseKnittingWidthFromSin(sin);
  const courses = parseCoursesFromSimx(simx, sin, width.wales, productionLetters(sin));
  console.log(`\n${label}`);
  console.log(' wales', width.wales, `#L=${width.left} #R=${width.right}`);
  console.log(' courses', courses.courses, courses.courses_source);
  console.log(' breakdown', courses.breakdown_text);
  console.log(' fixed', courses.fixed_courses, 'cycles', courses.cycles);
}

run(
  '5500 CORPO',
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/GARAGE/5500-REGATA-DANI/dados do programa/5500-REGATA-DANI-CORPO/5500-REGATA-DANI-CORPO.sin',
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/GARAGE/5500-REGATA-DANI/5500-REGATA-DANI-CORPO.simx'
);

run(
  '5534 CORPO',
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/RICHARDS/2026/5534-REGATA-LISTRA/dados do programa/5534-REGATA-LISTRA-CORPO/5534-REGATA-LISTRA-CORPO.sin',
  'C:/Users/Tricot&Cia/Desktop/PROGRAMAS/PROGRAMAS-POR-CLIENTE/RICHARDS/2026/5534-REGATA-LISTRA/dados do programa/5534-REGATA-LISTRA-CORPO/5534-REGATA-LISTRA-CORPO.simx'
);
