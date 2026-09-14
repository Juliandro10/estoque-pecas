/** Conta compartilhada dos setores: só Desenvolvimentos, nunca o estoque. */
export const DESENV_BOARD_EMAIL = 'desenvolvimentos@controle-tricot-e-cia.web.app';
export const DESENV_BOARD_USER = 'desenvolvimento';

const DESENV_LOGIN_ALIASES = new Set([
  DESENV_BOARD_USER,
  'desenv',
  'desenvolvimentos',
  DESENV_BOARD_EMAIL,
]);

/** O Firebase exige e-mail por baixo; na tela o setor entra com o usuário. */
export function resolveDesenvLogin(value: string) {
  const raw = value.trim().toLowerCase();
  if (DESENV_LOGIN_ALIASES.has(raw)) return DESENV_BOARD_EMAIL;
  return value.trim();
}

export function isDesenvBoardEmail(email: string | null | undefined) {
  return (email ?? '').trim().toLowerCase() === DESENV_BOARD_EMAIL;
}
