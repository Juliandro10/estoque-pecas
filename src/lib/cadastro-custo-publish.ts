import { doc, setDoc } from 'firebase/firestore';

import type { CadastroCustoView } from '../../shared/cadastro-pdf';
import { db } from '../firebase';

export const CADASTRO_CUSTO_COL = 'cadastro_custo_publico';

export async function publishCadastroCusto(view: CadastroCustoView) {
  const reference = view.reference.trim();
  if (!reference) throw new Error('Informe a referência.');
  await setDoc(doc(db, CADASTRO_CUSTO_COL, reference), {
    json: JSON.stringify(view),
    updated_at: new Date().toISOString(),
  });
}

export function cadastroCustoPageUrl(reference: string) {
  return `/ficha-custo/?ref=${encodeURIComponent(reference.trim())}`;
}
