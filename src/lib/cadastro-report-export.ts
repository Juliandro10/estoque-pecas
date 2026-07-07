import type { ModelCadastro } from '../types-programming';
import { buildCadastroPdfBuffer, cadastroPdfFileName, type CadastroPdfInput } from '../../shared/cadastro-pdf';

export function cadastroToPdfInput(cadastro: ModelCadastro): CadastroPdfInput {
  return {
    reference: cadastro.reference,
    name: cadastro.name,
    parts: cadastro.parts,
    yarn_parts: cadastro.yarn_parts,
    observations: cadastro.observations,
    updated_at: cadastro.updated_at,
  };
}

export function exportCadastroPdf(cadastro: ModelCadastro) {
  const buffer = buildCadastroPdfBuffer(cadastroToPdfInput(cadastro));
  const blob = new Blob([buffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = cadastroPdfFileName(cadastro.reference);
  link.click();
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
