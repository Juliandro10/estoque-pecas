import { FormEvent, useEffect, useMemo, useState } from 'react';

import {
  applyAutoYarnConsumption,
  cadastroDb,
  consolidateYarnParts,
  duplicatePart,
  formatConsumption,
  formatConsumptionInput,
  formatPct,
  isProgramFixedWasteYarnGuide,
  mergeYarnPartsFromSin,
  parseTimeInput,
  programPartsOnly,
  totalCalculatedYarnConsumption,
  totalPartsWeight,
  totalYarnConsumption,
} from '../../lib/cadastro-db';
import { exportCadastroPdf } from '../../lib/cadastro-report-export';
import {
  resolveConsolidatedYarns,
  yarnRowsReadyForSyntech,
} from '../../lib/syntech-yarn-match';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsParts,
  scannerSupportsSintralTimes,
  scannerSupportsSintralYarns,
  scannerSupportsSyntechFios,
  scannerSupportsSyntechPush,
} from '../../lib/local-programs-api';
import type {
  CadastroPart,
  CadastroYarnPart,
  ModelCadastro,
  SintralTimesResult,
  SyntechYarnCatalogFile,
} from '../../types-programming';

function applySintralTimes(currentParts: CadastroPart[], times: SintralTimesResult) {
  const byLabel = new Map(times.parts.map((p) => [p.label.toUpperCase(), p]));
  const byFile = new Map(times.parts.map((p) => [p.file_name.toLowerCase(), p]));

  const updated = currentParts.map((part) => {
    const hit =
      byLabel.get(part.label.toUpperCase()) ??
      (part.file_name ? byFile.get(part.file_name.toLowerCase()) : undefined);
    if (hit?.ok && hit.time_mmss) {
      return { ...part, time_mmss: hit.time_mmss };
    }
    return part;
  });

  const missing = times.parts.filter((p) => !p.ok && /\.mdv$/i.test(p.file_name)).map((p) => p.label);
  let message: string | null = null;

  if (times.filled > 0) {
    message = `${times.filled} de ${times.total} tempos (Controle Sintral)`;
    if (missing.length) message += ` · faltam: ${missing.join(', ')}`;
  } else if (times.total > 0) {
    message = 'Nenhum controle-sintral.json ainda — rode o cheque com Iniciar.bat aberto.';
  }

  return { parts: updated, message, missing };
}

export function DesenvCadastroPage() {
  const [reference, setReference] = useState('');
  const [fullSearch, setFullSearch] = useState(false);
  const [name, setName] = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  const [parts, setParts] = useState<CadastroPart[]>([]);
  const [yarnParts, setYarnParts] = useState<CadastroYarnPart[]>([]);
  const [observations, setObservations] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [readingTimes, setReadingTimes] = useState(false);
  const [readingYarns, setReadingYarns] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pushingSyntech, setPushingSyntech] = useState(false);
  const [syntechSupported, setSyntechSupported] = useState(false);
  const [syntechFiosSupported, setSyntechFiosSupported] = useState(false);
  const [yarnCatalog, setYarnCatalog] = useState<SyntechYarnCatalogFile | null>(null);
  const [syncingYarnCatalog, setSyncingYarnCatalog] = useState(false);
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);
  const [scannerOutdated, setScannerOutdated] = useState(false);
  const localMode = isLocalScannerAvailable();

  const yarnPartsComputed = useMemo(
    () => applyAutoYarnConsumption(yarnParts, parts),
    [yarnParts, parts]
  );

  const consolidatedYarns = useMemo(
    () => consolidateYarnParts(yarnPartsComputed, parts),
    [yarnPartsComputed, parts]
  );

  const consolidatedYarnsResolved = useMemo(
    () => resolveConsolidatedYarns(consolidatedYarns, yarnCatalog),
    [consolidatedYarns, yarnCatalog]
  );

  const unresolvedYarnCodes = useMemo(
    () => consolidatedYarnsResolved.filter((row) => !row.codigo_ok),
    [consolidatedYarnsResolved]
  );

  const unknownYarnColors = useMemo(
    () => consolidatedYarnsResolved.filter((row) => row.codigo_ok && row.cor && !row.cor_ok),
    [consolidatedYarnsResolved]
  );

  const totalPartWeight = useMemo(() => totalPartsWeight(parts), [parts]);
  const totalConsumption = useMemo(
    () => totalYarnConsumption(consolidatedYarns),
    [consolidatedYarns]
  );
  const totalCalculatedConsumption = useMemo(
    () => totalCalculatedYarnConsumption(consolidatedYarns),
    [consolidatedYarns]
  );

  useEffect(() => {
    if (!localMode) {
      setScannerOk(false);
      return;
    }
    localProgramsApi
      .health()
      .then((h) => {
        setScannerOk(true);
        setSyntechSupported(scannerSupportsSyntechPush(h));
        setSyntechFiosSupported(scannerSupportsSyntechFios(h));
        setScannerOutdated(
          !scannerSupportsParts(h) ||
            !scannerSupportsSintralTimes(h) ||
            !scannerSupportsSintralYarns(h) ||
            !scannerSupportsSyntechFios(h)
        );
      })
      .catch(() => setScannerOk(false));
  }, [localMode]);

  useEffect(() => {
    if (!localMode || !scannerOk || !syntechFiosSupported) {
      setYarnCatalog(null);
      return;
    }
    localProgramsApi
      .syntechFios()
      .then(setYarnCatalog)
      .catch(() => setYarnCatalog(null));
  }, [localMode, scannerOk, syntechFiosSupported]);

  async function refreshYarnParts(ref: string, saved: CadastroYarnPart[] = []) {
    if (!localMode || !scannerOk) {
      return { yarnParts: saved, message: null as string | null, machineLabel: null as string | null };
    }

    setReadingYarns(true);
    try {
      const yarns = await localProgramsApi.sintralYarns(ref, fullSearch);
      const merged = mergeYarnPartsFromSin(yarns.parts, saved);
      const message =
        yarns.filled > 0
          ? `${yarns.filled} de ${yarns.total} partes com fio no .sin`
          : yarns.total > 0
            ? 'Nenhum .sin com guias ainda — rode o cheque Sintral.'
            : null;
      return {
        yarnParts: merged,
        message,
        machineLabel: yarns.machine?.label ?? null,
      };
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler fios do .sin.');
      return { yarnParts: saved, message: null, machineLabel: null };
    } finally {
      setReadingYarns(false);
    }
  }

  async function refreshSintralTimes(ref: string, currentParts: CadastroPart[]) {
    if (!localMode || !scannerOk || currentParts.length === 0) {
      return { parts: currentParts, message: null as string | null };
    }

    setReadingTimes(true);
    try {
      const times = await localProgramsApi.sintralTimes(ref, fullSearch);
      const applied = applySintralTimes(currentParts, times);
      if (applied.message && times.filled > 0) setError('');
      if (times.filled === 0 && times.total > 0) {
        setError('Sem tempo ainda. Rode o Controle Sintral e deixe a janela aberta.');
      }
      return applied;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler tempos do Sintral.');
      return { parts: currentParts, message: null };
    } finally {
      setReadingTimes(false);
    }
  }

  async function loadReference(e?: FormEvent) {
    e?.preventDefault();
    const ref = reference.trim();
    if (!ref) return;

    setLoading(true);
    setError('');
    setInfo('');
    setMachineLabel('');
    try {
      const saved = await cadastroDb.get(ref);
      if (saved) {
        const savedParts = programPartsOnly(saved.parts);
        setName(saved.name);
        setParts(savedParts);
        setObservations(saved.observations);

        if (localMode && scannerOk) {
          const [timesResult, yarnsResult] = await Promise.all([
            refreshSintralTimes(ref, savedParts),
            refreshYarnParts(ref, saved.yarn_parts ?? []),
          ]);
          setParts(timesResult.parts);
          setYarnParts(yarnsResult.yarnParts);
          setMachineLabel(yarnsResult.machineLabel ?? '');
          const bits = [
            timesResult.message,
            yarnsResult.message,
          ].filter(Boolean);
          setInfo(bits.length ? bits.join(' · ') : `Cadastro ${ref} carregado do painel.`);
        } else {
          setYarnParts(saved.yarn_parts ?? []);
          setInfo(`Cadastro ${ref} carregado do painel.`);
        }
        return;
      }

      if (!localMode || !scannerOk) {
        setError('Para buscar partes na pasta PROGRAMAS, use o atalho local (Iniciar.bat).');
        return;
      }

      const found = await localProgramsApi.lookup(ref, fullSearch, true, true);
      if (!found.parts) {
        setError('Scanner antigo ainda ativo. Feche todas as janelas do Iniciar.bat e abra de novo.');
        return;
      }

      const fromFolder: CadastroPart[] = found.parts.map((p) => ({
        key: p.key,
        label: p.label,
        file_name: p.file_name,
        time_mmss: '',
        weight_kg: '',
      }));

      setName(found.name);
      setMachineLabel(found.machine?.label ?? '');

      const yarnsResult = await refreshYarnParts(ref);
      setYarnParts(yarnsResult.yarnParts);
      if (yarnsResult.machineLabel) setMachineLabel(yarnsResult.machineLabel);

      if (found.times) {
        const applied = applySintralTimes(fromFolder, found.times);
        setParts(applied.parts);
        const bits = [applied.message, yarnsResult.message].filter(Boolean);
        if (bits.length) {
          setInfo(bits.join(' · '));
          if (found.times.filled === 0) {
            setError('Sem tempo ainda. Rode o Controle Sintral e deixe a janela aberta.');
          }
        } else {
          setInfo(`${fromFolder.length} parte(s) na pasta.`);
        }
      } else {
        setParts(fromFolder);
        setInfo(
          [ `${fromFolder.length} parte(s) na pasta.`, yarnsResult.message].filter(Boolean).join(' · ')
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  async function readAllTimes() {
    const ref = reference.trim();
    if (!ref || parts.length === 0) return;
    if (!localMode || !scannerOk) {
      setError('Leitura só funciona pelo atalho local (Iniciar.bat).');
      return;
    }

    setError('');
    const result = await refreshSintralTimes(ref, parts);
    setParts(result.parts);
    if (result.message) setInfo(result.message);
  }

  function updatePart(index: number, patch: Partial<CadastroPart>) {
    setParts((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function duplicateRow(index: number) {
    setParts((prev) => {
      const copy = duplicatePart(prev[index]);
      return [...prev.slice(0, index + 1), copy, ...prev.slice(index + 1)];
    });
    setInfo(`${parts[index]?.label} duplicada.`);
  }

  function pasteTime(index: number) {
    const part = parts[index];
    setError('');
    void navigator.clipboard.readText().then((text) => {
      const raw = text.trim();
      if (!raw) {
        setError('Área de transferência vazia.');
        return;
      }
      const parsed = parseTimeInput(raw);
      if (!parsed) {
        setError(`Tempo não reconhecido: "${raw.slice(0, 50)}"`);
        return;
      }
      setParts((prev) =>
        prev.map((row, i) => (i === index ? { ...row, time_mmss: parsed } : row))
      );
      setInfo(`${part.label} — ${parsed} (colado)`);
    }).catch(() => {
      setError('Não foi possível ler a área de transferência.');
    });
  }

  async function readAllYarns() {
    const ref = reference.trim();
    if (!ref) return;
    if (!localMode || !scannerOk) {
      setError('Leitura só funciona pelo atalho local (Iniciar.bat).');
      return;
    }

    setError('');
    const result = await refreshYarnParts(ref, yarnParts);
    setYarnParts(result.yarnParts);
    if (result.machineLabel) setMachineLabel(result.machineLabel);
    if (result.message) setInfo(result.message);
  }

  async function syncYarnCatalog() {
    if (!localMode || !scannerOk) {
      setError('Sincronização só funciona pelo atalho local (Iniciar.bat).');
      return;
    }
    if (!syntechFiosSupported) {
      setError('Scanner desatualizado — reinicie o Iniciar.bat para sincronizar fios.');
      return;
    }

    setSyncingYarnCatalog(true);
    setError('');
    try {
      const catalog = await localProgramsApi.syncSyntechFios();
      setYarnCatalog(catalog);
      setInfo(`Catálogo Syntech atualizado — ${catalog.types.length} tipo(s) de fio.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao sincronizar fios do Syntech.');
    } finally {
      setSyncingYarnCatalog(false);
    }
  }

  async function saveCadastro() {
    const ref = reference.trim();
    if (!ref || !name.trim()) {
      setError('Informe referência e nome.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = await cadastroDb.save({
        reference: ref,
        name: name.trim(),
        parts: programPartsOnly(parts),
        yarn_parts: yarnPartsComputed,
        observations: observations,
      });
      setInfo(`Cadastro ${saved.reference} salvo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  async function pushToSyntech() {
    const ref = reference.trim();
    const programParts = programPartsOnly(parts);
    if (!ref) {
      setError('Informe a referência.');
      return;
    }
    if (!localMode || !scannerOk) {
      setError('Envio ao Syntech só funciona pelo atalho local (Iniciar.bat).');
      return;
    }
    if (!syntechSupported) {
      setError('Scanner desatualizado — reinicie o Iniciar.bat para habilitar envio ao Syntech.');
      return;
    }
    if (!syntechFiosSupported) {
      setError('Scanner desatualizado — reinicie o Iniciar.bat para habilitar catálogo de fios.');
      return;
    }
    if (consolidatedYarnsResolved.length > 0 && !yarnRowsReadyForSyntech(consolidatedYarnsResolved)) {
      setError(
        `Fio(s) sem código Syntech: ${unresolvedYarnCodes.map((row) => `bico ${row.guide}`).join(', ')}. Atualize o catálogo ou confira as descrições.`
      );
      return;
    }
    const readyParts = programParts.filter((part) => part.time_mmss.trim() && part.weight_kg.trim());
    if (readyParts.length === 0) {
      setError('Preencha tempo e peso de pelo menos uma parte antes de enviar.');
      return;
    }

    const colorWarning =
      unknownYarnColors.length > 0
        ? `\n\nAviso — cor não encontrada no cadastro: ${unknownYarnColors
            .map((row) => `bico ${row.guide} (${row.cor})`)
            .join(', ')}.`
        : '';

    if (
      !window.confirm(
        `Enviar cadastro ${ref} ao Syntech?\n\nGrava tempos/pesos e fios consolidados no banco da fábrica.${colorWarning}`
      )
    ) {
      return;
    }

    setPushingSyntech(true);
    setError('');
    try {
      const result = await localProgramsApi.syntechPush({
        reference: ref,
        full_search: fullSearch,
        parts: programParts.map((part) => ({
          label: part.label,
          file_name: part.file_name,
          time_mmss: part.time_mmss,
          weight_kg: part.weight_kg,
        })),
        consolidated_yarns: consolidatedYarnsResolved.map((row) => ({
          guide: row.guide,
          letter: row.letter,
          description: row.description,
          consumption: row.consumption,
          pct: row.pct,
          tipo_fio_codigo: row.tipo_fio_codigo ?? undefined,
        })),
      });

      const bits = [
        `${result.tempo_rows} parte(s) em TEMPO_PESO_PROD`,
        result.mat_prima_rows > 0 ? `${result.mat_prima_rows} fio(s) em MAT_PRIMA_PROD` : null,
        result.maquina
          ? `máquina ${result.maquina}${result.maquina_cms ? ` (${result.maquina_cms} ${result.maquina_gauge ?? ''})`.trim() : ''}`
          : null,
        result.programa ? `programa ${result.programa}` : null,
        result.guia_fio_rows > 0 ? `${result.guia_fio_rows} guia(s)-fio` : null,
        result.partes_prod_rows > 0 ? `${result.partes_prod_rows} parte(s) produto` : null,
        result.bicos_maquina_rows > 0 ? `${result.bicos_maquina_rows} bico(s) máquina` : null,
        result.product_name ? result.product_name : null,
      ].filter(Boolean);

      setInfo(`Syntech ${ref}: ${bits.join(' · ')}${result.warnings.length ? ` · avisos: ${result.warnings.join('; ')}` : ''}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar ao Syntech.');
    } finally {
      setPushingSyntech(false);
    }
  }

  function exportPdf() {
    const ref = reference.trim();
    if (!ref || parts.length === 0) {
      setError('Carregue e salve o cadastro antes de exportar.');
      return;
    }
    const cadastro: ModelCadastro = {
      reference: ref,
      name,
      parts: programPartsOnly(parts),
      yarn_parts: yarnPartsComputed,
      yarn_notes: '',
      observations,
      updated_at: new Date().toISOString(),
    };
    exportCadastroPdf(cadastro);
  }

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Desenv-Cadastro</h1>
          <p>Tempos do Controle Sintral · peso bruto (balança)</p>
        </div>
      </header>

      {localMode && scannerOk && !scannerOutdated ? (
        <div className="info-box">
          Carregar a referência lê .sin (processamento M1) e controle-sintral.json (cheque) de cada parte em dados do programa/
        </div>
      ) : null}
      {localMode && scannerOk && scannerOutdated ? (
        <div className="error-box">
          Scanner desatualizado — feche todas as janelas do Iniciar.bat e abra de novo.
        </div>
      ) : null}
      {error ? <div className="error-box">{error}</div> : null}
      {info ? <div className="info-box">{info}</div> : null}

      <form className="card load-form" onSubmit={(e) => void loadReference(e)}>
        <div className="load-row">
          <input
            placeholder="Referência (ex.: 5469)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
          />
          <button type="submit" className="btn" disabled={loading || readingTimes}>
            {loading ? 'Carregando…' : 'Carregar'}
          </button>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={fullSearch}
            onChange={(e) => setFullSearch(e.target.checked)}
          />
          Busca completa (ignora os 15 dias)
        </label>
      </form>

      {name ? (
        <>
          <div className="card meta-form">
            <div className="field">
              <label>Descrição</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            {machineLabel ? (
              <div className="field">
                <label>Máquina</label>
                <p className="machine-label mono">{machineLabel}</p>
              </div>
            ) : null}
            <div className="field">
              <div className="yarn-head">
                <label>Fio / matéria-prima</label>
                {localMode && scannerOk ? (
                  <div className="yarn-head-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      disabled={readingYarns}
                      onClick={() => void readAllYarns()}
                    >
                      {readingYarns ? 'Lendo…' : 'Atualizar do .sin'}
                    </button>
                    {syntechFiosSupported ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        disabled={syncingYarnCatalog}
                        onClick={() => void syncYarnCatalog()}
                      >
                        {syncingYarnCatalog ? 'Sincronizando…' : 'Atualizar fios Syntech'}
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
              {yarnParts.length === 0 ? (
                <p className="field-hint">Carregue a referência para ler as guias do .sin</p>
              ) : (
                <>
                  {consolidatedYarns.length > 0 ? (
                    <div className="yarn-consolidated">
                      <p className="yarn-consolidated-title">
                        Programa — fios consolidados
                        {yarnCatalog?.updated_at ? (
                          <span className="yarn-catalog-meta">
                            {' '}
                            · catálogo {new Date(yarnCatalog.updated_at).toLocaleDateString('pt-BR')}
                          </span>
                        ) : null}
                      </p>
                      {unresolvedYarnCodes.length > 0 ? (
                        <p className="yarn-catalog-warn">
                          Sem código Syntech:{' '}
                          {unresolvedYarnCodes.map((row) => `bico ${row.guide}`).join(', ')}
                        </p>
                      ) : null}
                      <div className="table-wrap yarn-table-wrap">
                        <table className="yarn-table yarn-table-consolidated">
                          <thead>
                            <tr>
                              <th className="yarn-col-pct">%</th>
                              <th className="yarn-col-consumo">Consumo</th>
                              <th className="yarn-col-bico">Bico</th>
                              <th className="yarn-col-cod">Cod.</th>
                              <th className="yarn-col-fio">Fio</th>
                              <th className="yarn-col-desc">Descrição</th>
                              <th className="yarn-col-parts">Partes</th>
                            </tr>
                          </thead>
                          <tbody>
                            {consolidatedYarnsResolved.map((row) => (
                              <tr
                                key={`${row.guide}-${row.letter}-${row.description}`}
                                className={!row.codigo_ok ? 'yarn-row-error' : !row.cor_ok ? 'yarn-row-warn' : undefined}
                              >
                                <td className="yarn-col-pct mono">
                                  {isProgramFixedWasteYarnGuide(row.guide)
                                    ? '—'
                                    : formatPct(row.pct)}
                                </td>
                                <td className="yarn-col-consumo mono">{row.consumption || '—'}</td>
                                <td className="yarn-col-bico mono">{row.guide}</td>
                                <td className="yarn-col-cod mono">
                                  {row.tipo_fio_codigo ?? '—'}
                                </td>
                                <td className="yarn-col-fio mono">{row.letter}</td>
                                <td className="yarn-col-desc">{row.description || '—'}</td>
                                <td className="yarn-col-parts">
                                  <div className="yarn-part-tags">
                                    {row.parts.map((part) => (
                                      <span key={part} className="yarn-part-tag">
                                        {part}
                                      </span>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="yarn-total-row">
                              <td className="yarn-col-pct mono">
                                {totalPartWeight > 0
                                  ? formatPct((totalCalculatedConsumption / totalPartWeight) * 100)
                                  : '—'}
                              </td>
                              <td className="yarn-col-consumo mono">
                                {totalConsumption > 0 ? formatConsumption(totalConsumption) : '—'}
                              </td>
                              <td colSpan={5} className="yarn-total-note">
                                Peso partes:{' '}
                                <span className="mono">
                                  {totalPartWeight > 0 ? formatConsumption(totalPartWeight) : '—'} kg
                                </span>
                                {' · '}
                                sep. 0,020 + elást. pente 0,010 fixos (bicos 1–2)
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ) : null}

                  <details className="yarn-part yarn-part-review">
                    <summary>Por parte (conferência)</summary>
                    <div className="yarn-parts">
                      {yarnParts.map((part) => (
                        <details key={part.key} className="yarn-part">
                          <summary>
                            <span className="mono">{part.label}</span>
                            <span className="muted">
                              {part.guides.length > 0
                                ? `${part.guides.length} guia(s)`
                                : 'sem guias no .sin'}
                            </span>
                          </summary>
                          {part.guides.length > 0 ? (
                            <div className="table-wrap yarn-table-wrap">
                              <table className="yarn-table">
                                <thead>
                                  <tr>
                                    <th className="yarn-col-pct">%</th>
                                    <th className="yarn-col-consumo">Consumo</th>
                                    <th className="yarn-col-bico">Guia</th>
                                    <th className="yarn-col-fio">Fio</th>
                                    <th className="yarn-col-desc">Descrição</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {yarnPartsComputed
                                    .find((row) => row.key === part.key)
                                    ?.guides.map((guide) => (
                                    <tr key={`${part.key}-${guide.side}-${guide.guide}-${guide.letter}`}>
                                      <td className="yarn-col-pct mono">{formatPct(guide.pct ?? 0, { ceil: true })}</td>
                                      <td className="yarn-col-consumo mono">{guide.consumption || '—'}</td>
                                      <td className="yarn-col-bico mono">{guide.guide}</td>
                                      <td className="yarn-col-fio mono">{guide.letter}</td>
                                      <td className="yarn-col-desc">{guide.description || '—'}</td>
                                    </tr>
                                  )) ?? null}
                                </tbody>
                              </table>
                            </div>
                          ) : null}
                        </details>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </div>
            <div className="field">
              <label>Observações</label>
              <textarea
                placeholder="Ex.: SWAROVSKI, acabamento especial…"
                value={observations}
                onChange={(e) => setObservations(e.target.value)}
              />
            </div>
          </div>

          <div className="table-toolbar">
            <button
              type="button"
              className="btn"
              disabled={readingTimes || !scannerOk}
              onClick={() => void readAllTimes()}
            >
              {readingTimes ? 'Lendo…' : 'Atualizar tempos'}
            </button>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Parte</th>
                  <th>Arquivo</th>
                  <th>Tempo (mm:ss)</th>
                  <th>Peso bruto (kg)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map((part, index) => (
                  <tr key={`${part.key}-${index}`}>
                    <td className="mono">{part.label}</td>
                    <td className="mono file-cell">{part.file_name}</td>
                    <td>
                      <input
                        className="cell-input"
                        placeholder="11:11"
                        value={part.time_mmss}
                        onChange={(e) => updatePart(index, { time_mmss: e.target.value })}
                        onBlur={(e) => {
                          const parsed = parseTimeInput(e.target.value);
                          if (parsed) updatePart(index, { time_mmss: parsed });
                        }}
                      />
                    </td>
                    <td>
                      <input
                        className="cell-input"
                        placeholder="0,070"
                        value={part.weight_kg}
                        onChange={(e) => updatePart(index, { weight_kg: e.target.value })}
                        onBlur={(e) => {
                          const normalized = formatConsumptionInput(e.target.value);
                          if (normalized !== e.target.value.trim()) {
                            updatePart(index, { weight_kg: normalized });
                          }
                        }}
                      />
                    </td>
                    <td className="row-actions">
                      <button
                        type="button"
                        className="btn btn-ghost btn-sm"
                        onClick={() => duplicateRow(index)}
                      >
                        Duplicar
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => pasteTime(index)}>
                        Colar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="actions">
            <button type="button" className="btn" disabled={saving} onClick={() => void saveCadastro()}>
              {saving ? 'Salvando…' : 'Salvar'}
            </button>
            {localMode && scannerOk && syntechSupported ? (
              <button
                type="button"
                className="btn"
                disabled={pushingSyntech || saving}
                onClick={() => void pushToSyntech()}
              >
                {pushingSyntech ? 'Enviando…' : 'Enviar ao Syntech'}
              </button>
            ) : null}
            <button type="button" className="btn btn-ghost" onClick={exportPdf}>
              PDF
            </button>
          </div>
        </>
      ) : null}

      <style>{`
        .load-form, .meta-form { padding: 16px; margin-bottom: 16px; }
        .load-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .load-row input { flex: 1; min-width: 180px; max-width: none; }
        .check-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
        .check-row input { width: auto; }
        .meta-form { display: flex; flex-direction: column; gap: 12px; }
        .machine-label { margin: 0; font-size: 14px; color: var(--text); }
        .table-toolbar { margin-bottom: 12px; }
        .cell-input { max-width: none; padding: 6px 8px; font-size: 13px; }
        .file-cell { font-size: 11px; color: var(--muted); max-width: 200px; word-break: break-all; }
        .row-actions { white-space: nowrap; display: flex; gap: 4px; flex-wrap: wrap; }
        .actions { display: flex; gap: 10px; margin-top: 16px; }
        .yarn-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
        .yarn-head label { margin: 0; }
        .yarn-head-actions { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
        .yarn-catalog-meta { color: var(--muted); font-weight: normal; }
        .yarn-catalog-warn { margin: 0 0 8px; font-size: 12px; color: #f0a060; }
        .yarn-row-error { background: rgba(220, 80, 80, 0.08); }
        .yarn-row-warn { background: rgba(240, 160, 96, 0.08); }
        .yarn-col-cod { width: 52px; text-align: right; }
        .field-hint { margin: 0; font-size: 13px; color: var(--muted); }
        .yarn-consolidated { margin-bottom: 12px; }
        .yarn-consolidated-title { margin: 0 0 8px; font-size: 13px; color: var(--muted); }
        .yarn-part-review { margin-top: 4px; }
        .yarn-parts { display: flex; flex-direction: column; gap: 8px; padding: 8px 0 0; }
        .yarn-part {
          border: 1px solid rgba(255,255,255,0.08);
          border-radius: 10px;
          background: rgba(255,255,255,0.02);
          overflow: hidden;
        }
        .yarn-part summary {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          cursor: pointer;
          list-style: none;
        }
        .yarn-part summary::-webkit-details-marker { display: none; }
        .yarn-table-wrap {
          border-top: 1px solid rgba(255,255,255,0.06);
          overflow-x: auto;
        }
        .yarn-table {
          width: 100%;
          table-layout: fixed;
        }
        .yarn-table-consolidated { min-width: 640px; }
        .yarn-table th {
          text-transform: none;
          letter-spacing: 0;
          font-size: 12px;
          white-space: nowrap;
          vertical-align: bottom;
        }
        .yarn-table td,
        .yarn-table th {
          padding: 8px 10px;
          vertical-align: middle;
          line-height: 1.35;
        }
        .yarn-col-consumo { width: 84px; }
        .yarn-col-pct { width: 58px; text-align: right; }
        .yarn-table .yarn-col-pct { text-align: right; }
        .yarn-col-bico { width: 48px; text-align: center; }
        .yarn-col-fio { width: 44px; text-align: center; }
        .yarn-col-desc {
          width: auto;
          word-break: normal;
          overflow-wrap: break-word;
        }
        .yarn-col-parts { width: 128px; }
        .yarn-table .yarn-col-bico,
        .yarn-table .yarn-col-fio { text-align: center; }
        .yarn-part-tags {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
        }
        .yarn-part-tag {
          display: inline-block;
          padding: 2px 7px;
          border-radius: 4px;
          font-family: Consolas, monospace;
          font-size: 11px;
          line-height: 1.3;
          background: rgba(255,255,255,0.07);
          color: var(--muted);
          white-space: nowrap;
        }
        .yarn-consumption { width: 100%; max-width: 84px; box-sizing: border-box; }
        .yarn-total-row td {
          border-top: 1px solid rgba(255,255,255,0.12);
          font-size: 12px;
          padding-top: 10px;
        }
        .yarn-total-note { color: var(--muted); font-size: 12px; }
        .info-box {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(45, 212, 191, 0.12);
          color: var(--mint);
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}
