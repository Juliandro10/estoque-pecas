import { FormEvent, useState } from 'react';

import { useAuth } from '../hooks/useAuth';

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await signIn(email.trim(), password);
    } catch {
      setError('Usuário ou senha incorretos.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="card login-card">
        <h1>Estoque</h1>
        <p className="login-sub">Tricot e Cia — entre com o usuário da fábrica ou o e-mail</p>
        <form onSubmit={(e) => void handleSubmit(e)} className="form-stack">
          {error ? <div className="error-box">{error}</div> : null}
          <div className="field">
            <label>Usuário</label>
            <input
              required
              type="text"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Senha</label>
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
      <style>{`
        .login-screen {
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 24px;
        }
        .login-card {
          width: min(400px, 100%);
          padding: 28px;
        }
        .login-card h1 {
          margin: 0 0 4px;
        }
        .login-sub {
          margin: 0 0 20px;
          color: var(--muted);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
