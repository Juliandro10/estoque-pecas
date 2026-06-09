import { importCatalog, readCatalogFile } from '../server/catalog.js';
import { store } from '../server/store.js';

const catalog = readCatalogFile();
const partCount = catalog.parts?.length ?? 0;
const machineCount = catalog.machines?.length ?? 0;

if (partCount === 0 && machineCount === 0) {
  console.log('Catálogo vazio. Edite data/catalogo.json e rode de novo.');
  process.exit(0);
}

const result = importCatalog({ preserveQuantity: true });
console.log('Importação concluída:');
console.log(`  Máquinas: +${result.machinesAdded} novas, ${result.machinesUpdated} atualizadas`);
console.log(`  Peças: +${result.partsAdded} novas, ${result.partsUpdated} atualizadas`);
console.log(`  Total no estoque: ${store.getParts().length} peças`);
