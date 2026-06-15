import path from 'node:path';

import {
  buildConsolidatedFromSinParts,
  buildWeightPartsFromPush,
  type ConsolidatedYarnOutput,
} from '../shared/yarn-consumption';
import { listModelParts } from './model-parts';
import { readSinYarnsForModel } from './sin-yarn';
import type { SyntechPushPart } from './syntech-push';

export function recalculateConsolidatedYarns(
  modelFolder: string,
  reference: string,
  pushParts: SyntechPushPart[]
): ConsolidatedYarnOutput[] {
  const folderName = path.basename(modelFolder);
  const folderParts = listModelParts(modelFolder, folderName, reference);
  if (folderParts.length === 0) return [];

  const weightParts = buildWeightPartsFromPush(folderParts, pushParts);
  const sinParts = readSinYarnsForModel(modelFolder, folderParts);

  return buildConsolidatedFromSinParts(
    sinParts
      .filter((row) => row.ok && row.guides.length > 0)
      .map((row) => ({
        label: row.label,
        file_name: row.file_name,
        guides: row.guides,
      })),
    weightParts
  );
}
