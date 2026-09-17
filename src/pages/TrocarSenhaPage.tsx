import { TrocarSenhaForm } from '../components/TrocarSenhaForm';

export function TrocarSenhaPage() {
  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Trocar senha</h1>
          <p>Qualquer pessoa com login pode trocar a senha depois de entrar.</p>
        </div>
      </header>
      <div className="card" style={{ padding: 20, maxWidth: 420 }}>
        <TrocarSenhaForm />
      </div>
    </div>
  );
}
