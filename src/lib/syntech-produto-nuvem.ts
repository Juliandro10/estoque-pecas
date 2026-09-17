import { doc, getDoc } from 'firebase/firestore';

import type { SyntechProdutoCadastro, SyntechProdutoCadastroOpcoes } from '../../shared/syntech-produto-cadastro';
import { db } from '../firebase';

export async function readSyntechProdutoNuvem(codigo: string) {
  const ref = codigo.trim();
  if (!ref) return null;
  const snap = await getDoc(doc(db, 'syntech_produtos', ref));
  if (!snap.exists()) return null;
  const json = snap.data()?.json;
  if (typeof json !== 'string' || json.length < 3) return null;
  try {
    return JSON.parse(json) as SyntechProdutoCadastro;
  } catch {
    return null;
  }
}

export async function readSyntechOpcoesNuvem() {
  const snap = await getDoc(doc(db, 'syntech_catalog', 'opcoes'));
  if (!snap.exists()) return null;
  const json = snap.data()?.json;
  if (typeof json !== 'string') return null;
  try {
    return JSON.parse(json) as SyntechProdutoCadastroOpcoes;
  } catch {
    return null;
  }
}
