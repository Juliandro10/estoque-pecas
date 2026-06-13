import type { GuiaFioRow } from './syntech-guia-fio';
import { resolveCaboNumberForBico } from './syntech-bico-rules';
import {
  expandProcessYarnComponents as expandProcessYarnComponentsCore,
  loadYarnWeightFactors,
  type ExpandProcessYarnOptions,
  type ProcessYarnInput,
  type YarnWeightFactorsFile,
} from '../shared/yarn-blend-core';

export * from '../shared/yarn-blend-core';

export function expandProcessYarnComponents(
  consolidated: ProcessYarnInput[],
  guiaRows: GuiaFioRow[] = [],
  yarnTypes: string[] = [],
  factors?: YarnWeightFactorsFile,
  partWeightKg?: number
) {
  const guiaCabos = new Map(
    guiaRows.map((row) => [row.numero, { cabo: row.cabo, cabod: row.cabod }])
  );
  const options: ExpandProcessYarnOptions = {
    guiaCabos,
    resolveCabo: (guide, description, parsedCabo) =>
      resolveCaboNumberForBico(guide, description, parsedCabo),
    partWeightKg,
  };
  return expandProcessYarnComponentsCore(
    consolidated,
    options,
    yarnTypes,
    factors ?? loadYarnWeightFactors()
  );
}
