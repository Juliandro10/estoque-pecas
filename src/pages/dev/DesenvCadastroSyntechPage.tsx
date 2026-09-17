import { FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  emptySyntechProdutoCadastro,
  type SyntechProdutoCadastro,
  type SyntechProdutoCadastroOpcoes,
  type SyntechProdutoParte,
} from '../../../shared/syntech-produto-cadastro';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsSyntechProdutoCadastro,
} from '../../lib/local-programs-api';
import { readSyntechOpcoesNuvem, readSyntechProdutoNuvem } from '../../lib/syntech-produto-nuvem';

type Aba = 'produto' | 'processos' | 'ficha';

function formatNum(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return '';
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function toNum(value: string, fallback: number | null = null) {
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

export function DesenvCadastroSyntechPage() {
  const [params, setParams] = useSearchParams();
  const codigoParam = params.get('codigo')?.trim() ?? '';
  const [busca, setBusca] = useState(codigoParam);
  const [aba, setAba] = useState<Aba>('produto');
  const [form, setForm] = useState<SyntechProdutoCadastro>(() => emptySyntechProdutoCadastro(codigoParam));
  const [opcoes, setOpcoes] = useState<SyntechProdutoCadastroOpcoes | null>(null);
  const [novo, setNovo] = useState(!codigoParam);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [scannerOk, setScannerOk] = useState(false);
  const [numDrafts, setNumDrafts] = useState<Record<string, string>>({});
  const [fotoBroken, setFotoBroken] = useState(false);
  const localMode = isLocalScannerAvailable();

  const tipoNome = useMemo(() => {
    const map = new Map((opcoes?.tipos_fio ?? []).map((row) => [row.codigo, row.nome]));
    return (codigo: number | null) => (codigo ? map.get(codigo) ?? '' : '');
  }, [opcoes]);

  function patch(partial: Partial<SyntechProdutoCadastro>) {
    setForm((cur) => ({ ...cur, ...partial }));
  }

  function numBind(
    key: string,
    value: number | null | undefined,
    onCommit: (n: number | null) => void,
    fallback: number | null = null
  ) {
    return {
      value: numDrafts[key] ?? formatNum(value),
      onChange: (e: { target: { value: string } }) => {
        setNumDrafts((cur) => ({ ...cur, [key]: e.target.value }));
      },
      onBlur: (e: { target: { value: string } }) => {
        const raw = e.target.value;
        onCommit(raw.trim() === '' ? fallback : toNum(raw, fallback));
        setNumDrafts((cur) => {
          if (!(key in cur)) return cur;
          const next = { ...cur };
          delete next[key];
          return next;
        });
      },
    };
  }

  async function boot() {
    if (!localMode) {
      try {
        const opcoesNuvem = await readSyntechOpcoesNuvem();
        if (opcoesNuvem) setOpcoes(opcoesNuvem);
        setInfo('Leitura pela nuvem. Para gravar, abra neste PC com o Iniciar.bat.');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Não deu para ler o cadastro na nuvem.');
      }
      return;
    }
    try {
      const health = await localProgramsApi.health();
      if (!scannerSupportsSyntechProdutoCadastro(health)) {
        setError('Scanner desatualizado — feche o Iniciar.bat e abra de novo.');
        return;
      }
      setScannerOk(true);
      setOpcoes(await localProgramsApi.syntechProdutoOpcoes());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para ler o Syntech.');
    }
  }

  async function loadCodigo(codigo: string) {
    const ref = codigo.trim();
    if (!ref) {
      setError('Informe o código.');
      return;
    }
    setLoading(true);
    setError('');
    setInfo('');
    try {
      let data = null as Awaited<ReturnType<typeof localProgramsApi.syntechProdutoGet>> | null;
      if (localMode) {
        try {
          data = await localProgramsApi.syntechProdutoGet(ref);
        } catch {
          data = null;
        }
      }
      if (!data) data = await readSyntechProdutoNuvem(ref);
      if (!data) throw new Error('Não achei esse produto. Abra neste PC com o Iniciar.bat para gravar na nuvem.');
      setForm(data);
      setFotoBroken(false);
      setNovo(false);
      setParams({ codigo: data.codigo });
      setBusca(data.codigo);
      setInfo(data && localMode ? `Cadastro ${data.codigo} lido do Syntech.` : `Cadastro ${data.codigo} lido da nuvem.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não achei esse produto.');
    } finally {
      setLoading(false);
    }
  }

  function blank() {
    setNovo(true);
    setForm(emptySyntechProdutoCadastro(''));
    setFotoBroken(true);
    setParams({});
    setBusca('');
    setInfo('Cadastro em branco. Preencha a aba Produto e salve.');
    setError('');
    setAba('produto');
  }

  async function onBuscar(ev: FormEvent) {
    ev.preventDefault();
    await loadCodigo(busca);
  }

  async function onSalvar() {
    setSaving(true);
    setError('');
    setInfo('');
    try {
      if (novo) {
        const result = await localProgramsApi.syntechProdutoCreate(form);
        setNovo(false);
        setForm((cur) => ({ ...cur, codigo: result.codigo, nome: result.nome || cur.nome }));
        setParams({ codigo: result.codigo });
        setBusca(result.codigo);
        setInfo(`Produto ${result.codigo} cadastrado no Syntech.`);
      } else {
        const result = await localProgramsApi.syntechProdutoSave(form.codigo, form);
        setInfo(`Cadastro ${result.codigo} gravado no Syntech.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu para gravar no Syntech.');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    void boot().then(() => {
      if (codigoParam) void loadCodigo(codigoParam);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function addParte() {
    patch({ partes: [...form.partes, { parte: '', quant: 1 }] });
  }

  function setParte(index: number, next: SyntechProdutoParte) {
    patch({ partes: form.partes.map((row, i) => (i === index ? next : row)) });
  }

  function removeParte(index: number) {
    patch({ partes: form.partes.filter((_, i) => i !== index) });
  }

  function addCor() {
    patch({ cores: [...form.cores, { cor: 0, nome: '', principal: form.cores.length === 0 }] });
  }

  return (
    <div className="syn-cad">
      <div className="syn-top">
        <Link to="/desenv-cadastro" className="btn btn-ghost">
          Voltar ao .sin
        </Link>
        <button type="button" className="btn btn-ghost" onClick={blank}>
          Novo produto
        </button>
      </div>

      {error ? <div className="error-box">{error}</div> : null}
      {info ? <div className="info-box">{info}</div> : null}

      <form className="card load-form" onSubmit={(ev) => void onBuscar(ev)}>
        <div className="load-row">
          <input
            placeholder="Código Syntech (ex.: 5614)"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <button type="submit" className="btn" disabled={loading || !scannerOk}>
            {loading ? 'Lendo…' : 'Abrir'}
          </button>
          <button type="button" className="btn" disabled={saving || !scannerOk} onClick={() => void onSalvar()}>
            {saving ? 'Gravando…' : novo ? 'Cadastrar no Syntech' : 'Salvar no Syntech'}
          </button>
        </div>
      </form>

      <nav className="syn-abas">
        <button type="button" className={aba === 'produto' ? 'on' : ''} onClick={() => setAba('produto')}>
          Produto
        </button>
        <button type="button" className={aba === 'processos' ? 'on' : ''} onClick={() => setAba('processos')}>
          Processos fábrica
        </button>
        <button type="button" className={aba === 'ficha' ? 'on' : ''} onClick={() => setAba('ficha')}>
          Ficha técnica
        </button>
      </nav>

      {aba === 'produto' ? (
        <section className="card syn-sec">
          <div className="syn-produto">
          <div className="syn-grid">
            <label>
              Código
              <input
                value={form.codigo}
                onChange={(e) => patch({ codigo: e.target.value })}
                disabled={!novo}
              />
            </label>
            <label className="span2">
              Descrição
              <input value={form.nome} onChange={(e) => patch({ nome: e.target.value })} />
            </label>
            <label>
              Unidade
              <input value={form.unidade} onChange={(e) => patch({ unidade: e.target.value })} />
            </label>
            <label>
              Peso bruto (kg)
              <input
                {...numBind('peso_bruto', form.peso_bruto, (n) => patch({ peso_bruto: n ?? 0 }), 0)}
              />
            </label>
            <label>
              Peso líquido (kg)
              <input
                {...numBind('peso_liquido', form.peso_liquido, (n) => patch({ peso_liquido: n ?? 0 }), 0)}
              />
            </label>
            <label>
              Classificação
              <select
                value={form.classificacao ?? ''}
                onChange={(e) => patch({ classificacao: toNum(e.target.value) })}
              >
                <option value="">—</option>
                {(opcoes?.classificacoes ?? []).map((row) => (
                  <option key={row.codigo} value={row.codigo}>
                    {String(row.codigo).padStart(4, '0')} {row.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Grupo
              <select value={form.grupo ?? ''} onChange={(e) => patch({ grupo: toNum(e.target.value) })}>
                <option value="">—</option>
                {(opcoes?.grupos ?? []).map((row) => (
                  <option key={row.codigo} value={row.codigo}>
                    {String(row.codigo).padStart(4, '0')} {row.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fornecedor
              <select
                value={form.fornecedor ?? ''}
                onChange={(e) => patch({ fornecedor: toNum(e.target.value) })}
              >
                <option value="">—</option>
                {(opcoes?.fornecedores ?? []).map((row) => (
                  <option key={row.codigo} value={row.codigo}>
                    {String(row.codigo).padStart(4, '0')} {row.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Funcionário
              <select
                value={form.funcionario ?? ''}
                onChange={(e) => patch({ funcionario: toNum(e.target.value) })}
              >
                <option value="">—</option>
                {(opcoes?.funcionarios ?? []).map((row) => (
                  <option key={row.codigo} value={row.codigo}>
                    {String(row.codigo).padStart(4, '0')} {row.nome}
                  </option>
                ))}
              </select>
            </label>
            <label>
              NCM
              <select value={form.ncm} onChange={(e) => patch({ ncm: e.target.value })}>
                <option value="">—</option>
                {(opcoes?.ncms ?? []).map((row) => (
                  <option key={row.codigo} value={row.codigo}>
                    {row.codigo}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Estoque mínimo
              <input
                {...numBind('estoque_minimo', form.estoque_minimo, (n) => patch({ estoque_minimo: n ?? 0 }), 0)}
              />
            </label>
            <label>
              Dias p/ entrega
              <input
                {...numBind('dias_entrega', form.dias_entrega, (n) => patch({ dias_entrega: n ?? 0 }), 0)}
              />
            </label>
            <label className="span3">
              Observações
              <textarea value={form.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} />
            </label>
          </div>
          <aside className="syn-foto">
            {!novo && form.codigo && !fotoBroken ? (
              <img
                src={localProgramsApi.syntechProdutoFotoUrl(form.codigo, form.md5_foto ?? '')}
                alt={`Foto ${form.codigo}`}
                onError={() => setFotoBroken(true)}
              />
            ) : (
              <div className="syn-foto-vazia">A foto está na pasta do Syntech. Este PC ainda não copiou o arquivo.</div>
            )}
            <span>Foto de identificação do Syntech</span>
          </aside>
          </div>
        </section>
      ) : null}

      {aba === 'processos' ? (
        <section className="card syn-sec">
          <h3>Matéria-prima da máquina</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bico</th>
                  <th>Área / parte</th>
                  <th>Tipo de fio</th>
                  <th>%</th>
                  <th>Cabo</th>
                  <th>Peso</th>
                </tr>
              </thead>
              <tbody>
                {form.bicos.map((row, index) => (
                  <tr key={row.bico}>
                    <td>{row.bico}</td>
                    <td>
                      <input
                        value={row.parte}
                        onChange={(e) =>
                          patch({
                            bicos: form.bicos.map((item, i) =>
                              i === index ? { ...item, parte: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <select
                        value={row.tipo_fio ?? ''}
                        onChange={(e) =>
                          patch({
                            bicos: form.bicos.map((item, i) =>
                              i === index ? { ...item, tipo_fio: toNum(e.target.value) } : item
                            ),
                          })
                        }
                      >
                        <option value="">—</option>
                        {(opcoes?.tipos_fio ?? []).map((tipo) => (
                          <option key={tipo.codigo} value={tipo.codigo}>
                            {tipo.codigo} {tipo.nome}
                          </option>
                        ))}
                      </select>
                      {row.tipo_fio ? <small>{tipoNome(row.tipo_fio)}</small> : null}
                    </td>
                    <td>
                      <input
                        {...numBind(`bico-${row.bico}-perc`, row.perc, (n) =>
                          patch({
                            bicos: form.bicos.map((item, i) => (i === index ? { ...item, perc: n } : item)),
                          })
                        )}
                      />
                    </td>
                    <td>
                      <input
                        {...numBind(`bico-${row.bico}-cabo`, row.cabo, (n) =>
                          patch({
                            bicos: form.bicos.map((item, i) => (i === index ? { ...item, cabo: n } : item)),
                          })
                        )}
                      />
                    </td>
                    <td>
                      <input
                        {...numBind(`bico-${row.bico}-peso`, row.peso, (n) =>
                          patch({
                            bicos: form.bicos.map((item, i) => (i === index ? { ...item, peso: n } : item)),
                          })
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="syn-split">
            <div>
              <h3>Partes do produto</h3>
              {form.partes.map((row, index) => (
                <div className="syn-parte" key={`parte-${index}`}>
                  <input
                    placeholder="Parte"
                    value={row.parte}
                    onChange={(e) => setParte(index, { ...row, parte: e.target.value })}
                  />
                  <input
                    placeholder="Qtd"
                    {...numBind(`parte-${index}-quant`, row.quant, (n) => setParte(index, { ...row, quant: n ?? 1 }), 1)}
                  />
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => removeParte(index)}>
                    Apagar
                  </button>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={addParte}>
                + Parte
              </button>
            </div>
            <div>
              <h3>Cores do produto acabado</h3>
              {form.cores.length === 0 ? <p className="muted">Nenhuma cor gravada neste produto.</p> : null}
              {form.cores.map((row, index) => (
                <div className="syn-parte" key={`cor-${index}`}>
                  <input
                    placeholder="Cód. cor"
                    {...numBind(`cor-${index}-cod`, row.cor, (n) =>
                      patch({
                        cores: form.cores.map((item, i) => (i === index ? { ...item, cor: n ?? 0 } : item)),
                      }), 0)}
                  />
                  <input
                    placeholder="Nome"
                    value={row.nome}
                    onChange={(e) =>
                      patch({
                        cores: form.cores.map((item, i) =>
                          i === index ? { ...item, nome: e.target.value } : item
                        ),
                      })
                    }
                  />
                  <label className="check-row">
                    <input
                      type="checkbox"
                      checked={row.principal}
                      onChange={(e) =>
                        patch({
                          cores: form.cores.map((item, i) => ({
                            ...item,
                            principal: i === index ? e.target.checked : false,
                          })),
                        })
                      }
                    />
                    Princ.
                  </label>
                </div>
              ))}
              <button type="button" className="btn btn-ghost btn-sm" onClick={addCor}>
                + Cor
              </button>
            </div>
          </div>
        </section>
      ) : null}

      {aba === 'ficha' ? (
        <section className="card syn-sec">
          <div className="syn-grid">
            <label className="span2">
              Programa
              <input value={form.programa} onChange={(e) => patch({ programa: e.target.value })} />
            </label>
            <label>
              Rec / máquina
              <select
                value={form.maquina ?? ''}
                onChange={(e) => patch({ maquina: toNum(e.target.value) })}
              >
                <option value="">—</option>
                {(opcoes?.maquinas ?? []).map((row) => (
                  <option key={row.numero} value={row.numero}>
                    {String(row.numero).padStart(4, '0')} {row.nome}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <h3>Guia-fios</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Cabo</th>
                  <th>Esquerda</th>
                  <th>Cabo</th>
                  <th>Direita</th>
                  <th>Cor do fio</th>
                </tr>
              </thead>
              <tbody>
                {form.guias.map((row, index) => (
                  <tr key={row.numero}>
                    <td>{row.numero}</td>
                    <td>
                      <input
                        value={row.cabo}
                        onChange={(e) =>
                          patch({
                            guias: form.guias.map((item, i) =>
                              i === index ? { ...item, cabo: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.esquerda}
                        onChange={(e) =>
                          patch({
                            guias: form.guias.map((item, i) =>
                              i === index ? { ...item, esquerda: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.cabod}
                        onChange={(e) =>
                          patch({
                            guias: form.guias.map((item, i) =>
                              i === index ? { ...item, cabod: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.direita}
                        onChange={(e) =>
                          patch({
                            guias: form.guias.map((item, i) =>
                              i === index ? { ...item, direita: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        value={row.cor_do_fio}
                        onChange={(e) =>
                          patch({
                            guias: form.guias.map((item, i) =>
                              i === index ? { ...item, cor_do_fio: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>Tempo e peso antes do corte</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Descrição</th>
                  <th>Tempo</th>
                  <th>Peso</th>
                </tr>
              </thead>
              <tbody>
                {form.tempos.map((row, index) => (
                  <tr key={row.numero}>
                    <td>{row.numero}</td>
                    <td>
                      <input
                        value={row.descricao}
                        onChange={(e) =>
                          patch({
                            tempos: form.tempos.map((item, i) =>
                              i === index ? { ...item, descricao: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        placeholder="mm:ss"
                        value={row.tempo}
                        onChange={(e) =>
                          patch({
                            tempos: form.tempos.map((item, i) =>
                              i === index ? { ...item, tempo: e.target.value } : item
                            ),
                          })
                        }
                      />
                    </td>
                    <td>
                      <input
                        {...numBind(`tempo-${row.numero}-peso`, row.peso, (n) =>
                          patch({
                            tempos: form.tempos.map((item, i) => (i === index ? { ...item, peso: n } : item)),
                          })
                        )}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <style>{`
        .syn-top { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
        .syn-abas { display: flex; gap: 8px; margin: 0 0 14px; flex-wrap: wrap; }
        .syn-abas button {
          border: 1px solid var(--border);
          background: var(--inset);
          color: var(--muted);
          border-radius: 999px;
          padding: 8px 14px;
          font-weight: 700;
        }
        .syn-abas button.on { background: var(--accent); color: #0b1220; border-color: transparent; }
        .syn-sec { padding: 16px; }
        .syn-sec h3 { margin: 16px 0 10px; font-size: 15px; }
        .syn-produto {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 220px;
          gap: 16px;
          align-items: start;
        }
        .syn-foto {
          border: 1px solid var(--border);
          background: var(--inset);
          border-radius: 10px;
          min-height: 280px;
          padding: 10px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .syn-foto img {
          width: 100%;
          height: 280px;
          object-fit: contain;
          background: #fff;
          border-radius: 6px;
        }
        .syn-foto-vazia {
          width: 100%;
          height: 280px;
          display: flex;
          align-items: center;
          justify-content: center;
          text-align: center;
          color: var(--muted);
          font-size: 14px;
          font-weight: 700;
        }
        .syn-foto span { font-size: 12px; color: var(--muted); font-weight: 600; text-align: center; }
        .syn-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        .syn-grid label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; color: var(--muted); font-weight: 700; }
        .span2 { grid-column: span 2; }
        .span3 { grid-column: span 3; }
        .table-wrap { overflow: auto; }
        .syn-sec table { width: 100%; border-collapse: collapse; }
        .syn-sec th, .syn-sec td { border-bottom: 1px solid var(--border); padding: 6px; text-align: left; vertical-align: top; }
        .syn-split { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 8px; }
        .syn-parte { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
        .muted { color: var(--muted); }
        small { display: block; color: var(--muted); font-weight: 400; }
        @media (max-width: 900px) {
          .syn-grid, .syn-split, .syn-produto { grid-template-columns: 1fr; }
          .span2, .span3 { grid-column: span 1; }
        }
      `}</style>
    </div>
  );
}
