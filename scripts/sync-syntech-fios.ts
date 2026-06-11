import { syncSyntechYarnCatalogFromDb } from '../server/syntech-yarn-catalog.ts';

console.log('Sincronizando catálogo de fios do Syntech…');

const catalog = await syncSyntechYarnCatalogFromDb();

console.log(
  JSON.stringify(
    {
      updated_at: catalog.updated_at,
      types: catalog.types.length,
      with_colors: catalog.types.filter((item) => item.cores.length > 0).length,
    },
    null,
    2
  )
);
