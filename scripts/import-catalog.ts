import { importCatalog, readCatalogFile } from '../server/catalog.js';
import { store } from '../server/store.js';

const count = readCatalogFile().parts?.length ?? 0;
if (count === 0) {
  console.log('Catálogo vazio em data/catalogo.json');
  process.exit(0);
}

const result = importCatalog({ preserveQuantity: true });
console.log(`Importado: +${result.added} novas, ${result.updated} atualizadas`);
console.log(`Total no estoque: ${store.getParts().length} peças`);
