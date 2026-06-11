import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fbBin = path.join(root, 'tools', 'firebird-textil', 'bin64');

if (!process.env.PATH?.toLowerCase().includes(fbBin.toLowerCase())) {
  process.env.PATH = `${fbBin};${process.env.PATH ?? ''}`;
}
