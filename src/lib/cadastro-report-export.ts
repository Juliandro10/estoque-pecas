import type { ModelCadastro, ProgramMachineInfo } from '../types-programming';
import { buildCadastroPdfBuffer, cadastroPdfFileName, type CadastroPdfInput } from '../../shared/cadastro-pdf';

export type CadastroPdfMachine = Pick<ProgramMachineInfo, 'cms' | 'gauge' | 'label'> | { label: string };

export function cadastroToPdfInput(
  cadastro: ModelCadastro,
  machine?: CadastroPdfMachine | null,
  yarnTypes: string[] = []
): CadastroPdfInput {
  return {
    reference: cadastro.reference,
    name: cadastro.name,
    parts: cadastro.parts,
    yarn_parts: cadastro.yarn_parts,
    observations: cadastro.observations,
    updated_at: cadastro.updated_at,
    machine_cms: machine && 'cms' in machine ? machine.cms : undefined,
    machine_gauge: machine && 'gauge' in machine ? machine.gauge : undefined,
    machine_label: machine?.label,
    yarn_types: yarnTypes,
  };
}

export function exportCadastroPdf(
  cadastro: ModelCadastro,
  machine?: CadastroPdfMachine | null,
  yarnTypes: string[] = []
) {
  const buffer = buildCadastroPdfBuffer(cadastroToPdfInput(cadastro, machine, yarnTypes));
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = cadastroPdfFileName(cadastro.reference);
  link.click();
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
