import { FormEvent, useEffect, useState } from 'react';

import { Modal } from '../components/Modal';
import { useAuth } from '../hooks/useAuth';
import { SENHA_PADRAO, senhaParaAuth } from '../../shared/mensageiro-auth';
import {
  abrirWhatsAppTexto,
  copiarTexto,
  textoAcesso,
} from '../lib/mensageiro-acesso';
import {
  criarPessoaRemota,
  excluirPessoa,
  listenPessoas,
  marcarPrecisaTrocarSenha,
  type MensageiroPessoa,
} from '../lib/mensageiro-db';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsMensageiroExcluir,
  scannerSupportsMensageiroSenha,
} from '../lib/local-programs-api';

type Envio = {
  uid: string;
  nome: string;
  login: string;
  jaGravada: boolean;
};

async function exigirScanner() {
  if (!isLocalScannerAvailable()) {
    throw new Error('Abra o Estoque neste computador (Iniciar.bat) para gerenciar login de outra pessoa.');
  }
  return localProgramsApi.health();
}

function EnviarAcessoModal({
  envio,
  senha,
  onSenha,
  onClose,
}: {
  envio: Envio;
  senha: string;
  onSenha: (value: string) => void;
  onClose: () => void;
}) {
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [texto, setTexto] = useState('');
  const [salvando, setSalvando] = useState(false);

  async function gravarEMontar() {
    const pass = senha.trim() || SENHA_PADRAO;
    if (senhaParaAuth(pass).length < 6) {
      throw new Error('A senha precisa ter pelo menos 6 caracteres, ou use a padrão 1234.');
    }
    if (!envio.jaGravada) {
      const health = await exigirScanner();
      if (!scannerSupportsMensageiroSenha(health)) {
        throw new Error('Feche e abra de novo o Iniciar.bat para atualizar o scanner e gravar a senha.');
      }
      await localProgramsApi.mensageiroSenha(envio.uid, pass);
    }
    await marcarPrecisaTrocarSenha(envio.uid);
    return textoAcesso({ nome: envio.nome, login: envio.login, senha: pass });
  }

  async function handleGravar(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    setSalvando(true);
    try {
      const msg = await gravarEMontar();
      setTexto(msg);
      const copiou = await copiarTexto(msg);
      setOk(copiou ? 'Senha gravada. Texto copiado — pode colar no WhatsApp.' : 'Senha gravada. Copie o texto abaixo.');
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para gravar a senha.');
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal title={`Enviar acesso — ${envio.nome}`} onClose={onClose}>
      <form onSubmit={(e) => void handleGravar(e)} className="form-stack">
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          A senha padrão do primeiro acesso é 1234. A pessoa troca depois de entrar.
        </p>
        {erro ? <div className="error-box">{erro}</div> : null}
        {ok ? <p style={{ color: 'var(--mint)', margin: 0 }}>{ok}</p> : null}
        <div className="field">
          <label>Usuário</label>
          <input readOnly value={envio.login} />
        </div>
        <div className="field">
          <label>Senha para enviar</label>
          <input required value={senha} onChange={(e) => onSenha(e.target.value)} minLength={4} autoComplete="off" />
        </div>
        {!texto ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="submit" className="btn" disabled={salvando}>
              {salvando ? 'Gravando…' : envio.jaGravada ? 'Preparar texto' : 'Gravar senha'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Fechar
            </button>
          </div>
        ) : (
          <>
            <div className="field">
              <label>Texto para enviar</label>
              <textarea readOnly rows={10} value={texto} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => abrirWhatsAppTexto(texto)}>
                WhatsApp
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() =>
                  void copiarTexto(texto).then((okCopy) => setOk(okCopy ? 'Copiado.' : 'Selecione o texto e copie.'))
                }
              >
                Copiar
              </button>
              <button type="button" className="btn btn-ghost" onClick={onClose}>
                Fechar
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}

export function MensageiroPessoasPage() {
  const { user } = useAuth();
  const [pessoas, setPessoas] = useState<MensageiroPessoa[]>([]);
  const [login, setLogin] = useState('');
  const [nome, setNome] = useState('');
  const [senha, setSenha] = useState(SENHA_PADRAO);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [excluindo, setExcluindo] = useState('');
  const [envio, setEnvio] = useState<Envio | null>(null);
  const [senhaEnvio, setSenhaEnvio] = useState(SENHA_PADRAO);

  useEffect(() => listenPessoas(setPessoas, (err) => setErro(err.message)), []);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    setSalvando(true);
    const senhaCriada = senha.trim() || SENHA_PADRAO;
    try {
      const created = await criarPessoaRemota({ login, nome, senha: senhaCriada });
      setOk(`Pronto. ${created.nome} entra com usuário ${created.login} e senha ${senhaCriada}.`);
      setLogin('');
      setNome('');
      setSenha(SENHA_PADRAO);
      setEnvio({
        uid: created.uid,
        nome: created.nome,
        login: created.login,
        jaGravada: true,
      });
      setSenhaEnvio(senhaCriada);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para criar.');
    } finally {
      setSalvando(false);
    }
  }

  function abrirEnvio(p: MensageiroPessoa) {
    setEnvio({
      uid: p.id,
      nome: p.nome,
      login: p.login,
      jaGravada: false,
    });
    setSenhaEnvio(SENHA_PADRAO);
  }

  async function excluirLogin(p: MensageiroPessoa) {
    if (!confirm(`Excluir o login de ${p.nome} (${p.login})?\nEssa pessoa não entra mais.`)) return;
    setErro('');
    setOk('');
    setExcluindo(p.id);
    try {
      const health = await exigirScanner();
      if (!scannerSupportsMensageiroExcluir(health)) {
        throw new Error('Feche e abra de novo o Iniciar.bat para atualizar o scanner e excluir o login.');
      }
      await localProgramsApi.mensageiroExcluir(p.id);
      await excluirPessoa(p.id);
      setOk(`Login de ${p.nome} excluído.`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para excluir.');
    } finally {
      setExcluindo('');
    }
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Pessoas</h1>
          <p>Cada um tem login e senha. A conversa é só entre dois — os outros não veem.</p>
        </div>
      </header>
      {erro ? <div className="error-box" style={{ marginBottom: 16 }}>{erro}</div> : null}
      {ok ? <p style={{ color: 'var(--mint)', marginTop: 0 }}>{ok}</p> : null}
      <div className="card" style={{ padding: 20, marginBottom: 20, maxWidth: 480 }}>
        <h2 style={{ marginTop: 0 }}>Novo login da fábrica</h2>
        <form onSubmit={(e) => void handleSubmit(e)} className="form-stack">
          <div className="field">
            <label>Nome</label>
            <input required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Maria" />
          </div>
          <div className="field">
            <label>Usuário (sem espaço)</label>
            <input
              required
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="maria"
              autoComplete="off"
            />
          </div>
          <div className="field">
            <label>Senha (padrão 1234)</label>
            <input
              required
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              minLength={4}
              autoComplete="new-password"
            />
          </div>
          <button type="submit" className="btn" disabled={salvando}>
            {salvando ? 'Criando…' : 'Criar login'}
          </button>
        </form>
      </div>
      <div className="card" style={{ padding: 8, overflow: 'auto' }}>
        <table className="table">
          <thead>
            <tr>
              <th>Nome</th>
              <th>Usuário</th>
              <th>Tipo</th>
              <th>Acesso</th>
            </tr>
          </thead>
          <tbody>
            {pessoas.map((p) => (
              <tr key={p.id}>
                <td>{p.nome}</td>
                <td>{p.login}</td>
                <td>{p.papel === 'estoque' ? 'Estoque / programação' : 'Fábrica'}</td>
                <td>
                  {p.id === user?.uid ? null : (
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button type="button" className="btn btn-sm" onClick={() => abrirEnvio(p)}>
                        Enviar acesso
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        disabled={excluindo === p.id}
                        onClick={() => void excluirLogin(p)}
                      >
                        {excluindo === p.id ? 'Excluindo…' : 'Excluir'}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {envio ? (
        <EnviarAcessoModal
          envio={envio}
          senha={senhaEnvio}
          onSenha={setSenhaEnvio}
          onClose={() => setEnvio(null)}
        />
      ) : null}
    </div>
  );
}
