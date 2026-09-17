import { FormEvent, useState } from 'react';

import { useAuth } from '../hooks/useAuth';
import { trocarMinhaSenha } from '../lib/mensageiro-acesso';

type Props = {
  obrigatorio?: boolean;
};

export function TrocarSenhaForm({ obrigatorio }: Props) {
  const { signOut } = useAuth();
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [confirma, setConfirma] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    if (nova !== confirma) {
      setErro('A confirmação não bate com a senha nova.');
      return;
    }
    setSalvando(true);
    try {
      await trocarMinhaSenha(atual, nova);
      setOk('Senha trocada.');
      setAtual('');
      setNova('');
      setConfirma('');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para trocar a senha.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="form-stack">
      {obrigatorio ? (
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          No primeiro acesso você precisa escolher uma senha sua. Se a senha nova já estiver valendo, confirme ela aqui de novo.
        </p>
      ) : null}
      {erro ? <div className="error-box">{erro}</div> : null}
      {ok ? <p style={{ color: 'var(--mint)', margin: 0 }}>{ok}</p> : null}
      <div className="field">
        <label>Senha atual</label>
        <input
          required
          type="password"
          autoComplete="current-password"
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Senha nova</label>
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />
      </div>
      <div className="field">
        <label>Confirmar senha nova</label>
        <input
          required
          type="password"
          autoComplete="new-password"
          minLength={6}
          value={confirma}
          onChange={(e) => setConfirma(e.target.value)}
        />
      </div>
      <button type="submit" className="btn" disabled={salvando}>
        {salvando ? 'Gravando…' : 'Trocar senha'}
      </button>
      {obrigatorio ? (
        <button type="button" className="btn btn-ghost" onClick={() => void signOut()}>
          Sair
        </button>
      ) : null}
    </form>
  );
}
