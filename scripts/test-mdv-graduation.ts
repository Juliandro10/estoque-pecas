import { isDevelopmentMdvFile, isGraduatedMdvFile } from '../server/mdv-graduation.ts';

const samples = [
  ['5433-BLUSA-TRANCAS-FT.mdv', true],
  ['5433-BLUSA-TRANCAS-FT-M.mdv', false],
  ['5433-BLUSA-TRANCAS-FT-PP.mdv', false],
  ['5433-BLUSA-TRANCAS-FT-GG.mdv', false],
  ['5433-BLUSA-TRANCAS-MG.mdv', true],
  ['5433-BLUSA-TRANCAS-MG-M.mdv', false],
  ['5472-CARDIGAN-CASULO-CT.mdv', true],
  ['5455-TOP-CROCHE-LEIA-CT-P-4.mdv', false],
] as const;

console.log('Filtro desenvolvimento (sem graduação):\n');
for (const [file, expectedDev] of samples) {
  const dev = isDevelopmentMdvFile(file);
  const grad = isGraduatedMdvFile(file);
  const ok = dev === expectedDev;
  console.log(
    `  ${ok ? 'OK' : 'ERRO'}  ${file.padEnd(40)} dev=${String(dev).padEnd(5)} grad=${grad}`
  );
}
