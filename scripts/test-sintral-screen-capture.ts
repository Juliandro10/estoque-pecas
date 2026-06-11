import '../server/block-model-root-writes.ts';
import { scanSintralScreen } from '../server/sintral-screen.ts';

const programsRoot = process.env.PROGRAMS_ROOT ?? 'C:/Users/Tricot&Cia/Desktop/PROGRAMAS';
const result = await scanSintralScreen(programsRoot);
console.log(JSON.stringify(result, null, 2));
