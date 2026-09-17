import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';

import { SENHA_PADRAO, senhaParaAuth } from '../../shared/mensageiro-auth';
import { auth } from '../firebase';
import { marcarSenhaTrocada } from './mensageiro-db';

export const SITE_ACESSO = 'https://controle-tricot-e-cia.web.app';
export { SENHA_PADRAO } from '../../shared/mensageiro-auth';

export function textoAcesso(opts: { nome: string; login: string; senha: string }) {
  const nome = opts.nome.trim() || opts.login;
  return [
    `Olá ${nome},`,
    '',
    'Seu acesso ao Estoque (mensagens).',
    'Não use a tela de Desenvolvimentos.',
    '',
    `Abra: ${SITE_ACESSO}`,
    `Usuário: ${opts.login}`,
    `Senha: ${opts.senha}`,
    '',
    'No primeiro acesso o sistema pede para você trocar essa senha.',
  ].join('\n');
}

export function abrirWhatsAppTexto(texto: string) {
  window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank', 'noopener,noreferrer');
}

export async function copiarTexto(texto: string) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
}

function mapAuthErr(err: unknown) {
  const code = typeof err === 'object' && err && 'code' in err ? String((err as { code: string }).code) : '';
  if (code.includes('wrong-password') || code.includes('invalid-credential') || code.includes('invalid-login')) {
    return new Error('A senha atual está errada.');
  }
  if (code.includes('weak-password')) return new Error('Senha nova fraca demais.');
  if (code.includes('requires-recent-login')) return new Error('Entre de novo e tente trocar a senha.');
  return err instanceof Error ? err : new Error('Não deu para trocar a senha.');
}

export async function trocarMinhaSenha(senhaAtual: string, senhaNova: string) {
  const user = auth.currentUser;
  if (!user?.email) throw new Error('Entre de novo e tente outra vez.');
  const atual = senhaAtual.trim();
  const nova = senhaNova.trim();
  if (nova.length < 6) throw new Error('A senha nova precisa ter pelo menos 6 caracteres.');
  if (atual === SENHA_PADRAO && nova === SENHA_PADRAO) {
    throw new Error('Escolha uma senha diferente de 1234.');
  }
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, senhaParaAuth(atual)));
    await marcarSenhaTrocada(user.uid);
    if (atual !== nova) {
      await updatePassword(user, nova);
    }
  } catch (err) {
    throw mapAuthErr(err);
  }
}
