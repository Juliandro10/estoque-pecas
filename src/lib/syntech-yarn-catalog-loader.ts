import type { SyntechYarnCatalogFile } from '../types-programming';
import { isLocalScannerAvailable, localProgramsApi } from './local-programs-api';

import bundledCatalog from '@syntech-catalog';

export async function loadSyntechYarnCatalog(options?: { sync?: boolean }) {
  if (isLocalScannerAvailable()) {
    try {
      if (options?.sync) {
        return await localProgramsApi.syncSyntechFios();
      }
      return await localProgramsApi.syntechFios();
    } catch {
      // usa cópia local em data/syntech-fios.json
    }
  }

  return bundledCatalog as SyntechYarnCatalogFile;
}
