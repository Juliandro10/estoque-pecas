import { parseMachineBedFromSin } from './jac-density';

export type SinSizeParse = {
  machine_bed: number | null;
};

/** Mantido só para detectar largura total da máquina (não é malha do pano). */
export function parseSizesFromSin(text: string): SinSizeParse {
  return {
    machine_bed: parseMachineBedFromSin(text),
  };
}
