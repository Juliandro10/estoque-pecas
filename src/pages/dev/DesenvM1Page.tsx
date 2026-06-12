import { FormEvent, useEffect, useMemo, useState } from 'react';

import { normalizeYarnDescriptionKey } from '../../lib/cadastro-db';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsM1Density,
  scannerSupportsSyntechFios,
} from '../../lib/local-programs-api';
import { resolveYarnRow } from '../../lib/syntech-yarn-match';
import type {
  M1DensityPart,
  M1KnowledgeFile,
  M1Measurement,
  ProgramPartLookup,
  SyntechYarnCatalogFile,
} from '../../types-programming';

function formatDensity(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function sourceLabel(part: M1DensityPart | null) {
  if (!part?.sizes) return '';
  const bits: string[] = [];
  const ws = part.sizes.wales_source;
  const cs = part.sizes.courses_source;
  if (ws === 'sin-lr-mode') {
    const lr =
      part.sizes.knitting_left != null && part.sizes.knitting_right != null
        ? `#L=${part.sizes.knitting_left} #R=${part.sizes.knitting_right}`
        : '.sin';
    bits.push(`Malhas: ${lr}`);
  }
  if (cs === 'simx-rs-expanded') bits.push('Passadas: .simx (ciclo expandido)');
  else if (cs === 'simx-rs-formula') bits.push('Passadas: .simx + .sin (ciclos RS)');
  else if (cs === 'simx-prod-lines') bits.push('Passadas: .simx (linhas produção)');
  if (part.sizes.courses_breakdown) bits.push(part.sizes.courses_breakdown);
  if (part.sizes.machine_bed) bits.push(`Máq. ${part.sizes.machine_bed} agulhas`);
  if (part.sizes.sintral_cursos != null) {
    bits.push(`Sintral cursos: ${part.sizes.sintral_cursos} (ref.)`);
  }
  return bits.join(' · ');
}

function formatDensityBar(walesPer10cm: number, coursesPer10cm: number) {
  return `${formatDensity(walesPer10cm)} agulhas / 10 cm · ${formatDensity(coursesPer10cm)} carr / 10 cm`;
}

function npRowLabel(row: { label?: string; comment?: string }) {
  return (row.comment ?? row.label ?? '').trim();
}

function npHighlightForStitch(
  row: { label?: string; comment?: string },
  stitchName: string | undefined
) {
  if (!stitchName) return false;
  const text = npRowLabel(row).toLowerCase();
  const stitch = stitchName.toLowerCase();
  if (!text) return false;
  if (stitch.includes('canelado') && text.includes('canelado')) return true;
  if (stitch.includes('meia') && (text.includes('meia') || text.includes('malha'))) return true;
  if (stitch.includes('jersey') && text.includes('jersey')) return true;
  if (stitch.includes('1x1') && text.includes('1x1')) return true;
  const words = stitch.split(/[\s/()-]+/).filter((w) => w.length >= 4);
  return words.some((word) => text.includes(word));
}

function parseCmInput(raw: string) {
  const n = Number(raw.trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function formatNpValue(value: number) {
  return value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
}

function yarnRowForMatch(yarn: { guide: number; letter: string; description: string; pct?: number }) {
  return {
    guide: yarn.guide,
    letter: yarn.letter,
    description: yarn.description,
    pct: yarn.pct ?? 0,
    consumption: '',
    parts: [] as string[],
  };
}

function findLatestMeasurement(
  knowledge: M1KnowledgeFile | null,
  ref: string,
  part: ProgramPartLookup,
  partBase?: string
) {
  if (!knowledge) return null;
  const normalizedRef = ref.trim();
  const rows = knowledge.measurements
    .filter((row) => {
      if (row.reference !== normalizedRef) return false;
      if (row.partLabel === part.label) return true;
      if (partBase && row.partBase === partBase) return true;
      const mdvBase = part.file_name.replace(/\.mdv$/i, '');
      return row.partBase === mdvBase;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return rows[0] ?? null;
}

export function DesenvM1Page() {
  const [reference, setReference] = useState('');
  const [fullSearch, setFullSearch] = useState(false);
  const [folderPath, setFolderPath] = useState('');
  const [modelName, setModelName] = useState('');
  const [parts, setParts] = useState<ProgramPartLookup[]>([]);
  const [selectedPartKey, setSelectedPartKey] = useState('');
  const [densityPart, setDensityPart] = useState<M1DensityPart | null>(null);
  const [widthCm, setWidthCm] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [walesOverride, setWalesOverride] = useState('');
  const [coursesOverride, setCoursesOverride] = useState('');
  const [stitchTypeId, setStitchTypeId] = useState('');
  const [notes, setNotes] = useState('');
  const [knowledge, setKnowledge] = useState<M1KnowledgeFile | null>(null);
  const [similar, setSimilar] = useState<M1Measurement[]>([]);
  const [yarnCatalog, setYarnCatalog] = useState<SyntechYarnCatalogFile | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPart, setLoadingPart] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);
  const [m1Supported, setM1Supported] = useState(false);
  const localMode = isLocalScannerAvailable();

  const selectedPart = useMemo(
    () => parts.find((p) => p.key === selectedPartKey) ?? null,
    [parts, selectedPartKey]
  );

  const wales = useMemo(() => {
    const manual = parseCmInput(walesOverride);
    if (manual != null) return manual;
    return densityPart?.sizes?.wales ?? null;
  }, [walesOverride, densityPart]);

  const courses = useMemo(() => {
    const manual = parseCmInput(coursesOverride);
    if (manual != null) return manual;
    return densityPart?.sizes?.courses ?? null;
  }, [coursesOverride, densityPart]);

  const width = parseCmInput(widthCm);
  const height = parseCmInput(heightCm);

  const densityPreview = useMemo(() => {
    if (wales == null || courses == null || width == null || height == null) return null;
    return {
      walesPer10cm: (wales / width) * 10,
      coursesPer10cm: (courses / height) * 10,
    };
  }, [wales, courses, width, height]);

  const refHistory = useMemo(() => {
    if (!knowledge || !reference.trim()) return [];
    return [...knowledge.measurements]
      .filter((m) => m.reference === reference.trim())
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [knowledge, reference]);

  const selectedStitch = useMemo(
    () => knowledge?.stitchTypes.find((s) => s.id === stitchTypeId) ?? null,
    [knowledge, stitchTypeId]
  );

  const graduacao = useMemo(() => {
    if (!densityPart?.regulation) return null;
    const { regulation } = densityPart;
    const useSetx = regulation.primary_source === 'setx' && regulation.setx_nps.length > 0;
    const primary = useSetx
      ? regulation.setx_nps.map((row) => ({
          np: row.np,
          value: row.value,
          label: npRowLabel(row),
        }))
      : regulation.sin_nps.map((row) => ({
          np: row.np,
          value: row.value,
          label: npRowLabel(row),
        }));
    const sinByNp = new Map(regulation.sin_nps.map((row) => [row.np, row]));
    return {
      source: useSetx ? ('setx' as const) : ('sin' as const),
      rows: primary,
      sinFallback: useSetx ? regulation.sin_nps : [],
      msec: regulation.setx_msec ?? [],
      mseci: regulation.mseci,
      npj: regulation.sin_npj,
      sinByNp,
    };
  }, [densityPart]);

  useEffect(() => {
    if (!localMode) {
      setScannerOk(false);
      return;
    }
    localProgramsApi
      .health()
      .then((h) => {
        setScannerOk(true);
        setM1Supported(scannerSupportsM1Density(h));
      })
      .catch(() => setScannerOk(false));
  }, [localMode]);

  useEffect(() => {
    if (!localMode || !scannerOk || !m1Supported) return;
    void localProgramsApi.m1Knowledge().then(setKnowledge).catch(() => setKnowledge(null));
    if (scannerSupportsSyntechFios({ version: 23 })) {
      void localProgramsApi.syntechFios().then(setYarnCatalog).catch(() => setYarnCatalog(null));
    }
  }, [localMode, scannerOk, m1Supported]);

  async function loadPartDensity(part: ProgramPartLookup, knowledgeLib?: M1KnowledgeFile | null) {
    const ref = reference.trim();
    if (!ref || !localMode || !scannerOk || !m1Supported) return;

    setLoadingPart(true);
    setError('');
    setWidthCm('');
    setHeightCm('');
    setStitchTypeId('');
    setNotes('');
    try {
      const lib = knowledgeLib ?? knowledge ?? (await localProgramsApi.m1Knowledge());
      if (!knowledgeLib && !knowledge) setKnowledge(lib);

      const result = await localProgramsApi.m1Density(ref, fullSearch, part.file_name);
      const row = result.part ?? result.parts.find((p) => p.file_name === part.file_name) ?? null;
      setDensityPart(row);
      setWalesOverride('');
      setCoursesOverride('');

      if (row?.sizes?.wales != null) setWalesOverride(String(row.sizes.wales));
      if (row?.sizes?.courses != null) setCoursesOverride(String(row.sizes.courses));

      const saved = findLatestMeasurement(lib, ref, part, row?.part_base);
      if (saved) {
        setWidthCm(String(saved.swatch.widthCm));
        setHeightCm(String(saved.swatch.heightCm));
        if (saved.stitchTypeId) setStitchTypeId(saved.stitchTypeId);
        setNotes(saved.notes ?? '');
        if (!row?.ok) {
          if (saved.programCounts.wales > 0) setWalesOverride(String(saved.programCounts.wales));
          if (saved.programCounts.courses > 0) setCoursesOverride(String(saved.programCounts.courses));
        }
        setInfo(`Medição de ${new Date(saved.createdAt).toLocaleDateString('pt-BR')} restaurada.`);
      }

      if (row && !row.ok && !saved) setError(row.error ?? 'Dados incompletos no .sin.');
      else if (row && !row.ok && saved) {
        setError(row.error ?? 'Programa incompleto — usando última medição salva.');
      }

      const primaryYarn = row?.yarns?.[0];
      const stitchCode =
        saved?.stitchTypeCode ??
        lib.stitchTypes.find((s) => s.id === (saved?.stitchTypeId ?? stitchTypeId))?.code;
      if (primaryYarn && row?.machine) {
        const key = normalizeYarnDescriptionKey(primaryYarn.description);
        const resolved = resolveYarnRow(yarnRowForMatch(primaryYarn), yarnCatalog);
        const similarResult = await localProgramsApi.m1Similar({
          syntech_cod: resolved.tipo_fio_codigo ?? undefined,
          yarn_key: key,
          cms: row.machine.cms,
          gauge: row.machine.gauge,
          stitch: stitchCode,
        });
        setSimilar(similarResult.items);
      } else {
        setSimilar([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler .sin.');
      setDensityPart(null);
      setSimilar([]);
    } finally {
      setLoadingPart(false);
    }
  }

  async function loadReference(e?: FormEvent) {
    e?.preventDefault();
    const ref = reference.trim();
    if (!ref) return;

    if (!localMode || !scannerOk) {
      setError('Use o Iniciar.bat para acessar a pasta PROGRAMAS.');
      return;
    }
    if (!m1Supported) {
      setError('Scanner desatualizado. Feche e abra de novo o Iniciar.bat.');
      return;
    }

    setLoading(true);
    setError('');
    setInfo('');
    setDensityPart(null);
    setSimilar([]);

    try {
      const lib = await localProgramsApi.m1Knowledge();
      setKnowledge(lib);

      const found = await localProgramsApi.lookup(ref, fullSearch, true);
      if (!found.parts?.length) {
        setError('Referência sem partes .mdv.');
        return;
      }

      const partRows = found.parts!;
      setFolderPath(found.folder_path);
      setModelName(found.name);
      setParts(partRows);
      setSelectedPartKey(partRows[0].key);

      await loadPartDensity(partRows[0], lib);
      setInfo((prev) => prev || `${partRows.length} parte(s) · ${found.machine?.label ?? 'máquina no .sin'}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }

  async function onSelectPart(key: string) {
    setSelectedPartKey(key);
    const part = parts.find((p) => p.key === key);
    if (part) await loadPartDensity(part);
  }

  async function saveMeasurement() {
    const ref = reference.trim();
    if (!ref || !selectedPart || wales == null || courses == null) {
      setError('Carregue a referência e confira malhas/passadas.');
      return;
    }
    if (width == null || height == null) {
      setError('Informe largura e altura do pano em cm.');
      return;
    }
    if (!densityPart) {
      setError('Sem dados do .sin.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const stitch = knowledge?.stitchTypes.find((s) => s.id === stitchTypeId);
      const yarns =
        densityPart.yarns?.map((yarn) => {
          const key = normalizeYarnDescriptionKey(yarn.description);
          const resolved = resolveYarnRow(
            yarnRowForMatch({ ...yarn, pct: yarn.pct }),
            yarnCatalog
          );
          return {
            bico: yarn.guide,
            sinDescription: yarn.description,
            sinDescriptionKey: key,
            syntechCod: resolved.tipo_fio_codigo ?? null,
            syntechDesc: resolved.tipo_fio_nome ?? null,
            pct: yarn.pct ?? null,
            letter: yarn.letter,
          };
        }) ?? [];

      const machine = densityPart.machine ?? {
        cms: '',
        gauge: '',
        label: '',
        syntech_maquina: null,
      };

      const result = await localProgramsApi.saveM1Measurement({
        reference: ref,
        program_folder: folderPath,
        part_base: densityPart.part_base,
        part_label: selectedPart.label,
        width_cm: width,
        height_cm: height,
        wales,
        courses,
        program_counts_source: densityPart.sizes?.courses_source ?? 'jac',
        machine,
        regulation: {
          primarySource: densityPart.regulation?.primary_source === 'setx' ? 'setx' : 'sin',
          sinNps: densityPart.regulation?.sin_nps ?? [],
          setxNps: (densityPart.regulation?.setx_nps ?? []).map((row) => ({
            np: row.np,
            value: row.value,
            comment: row.comment ?? row.label ?? '',
          })),
          ydf: densityPart.regulation?.ydf,
          ygc: densityPart.regulation?.ygc,
          mseci: densityPart.regulation?.mseci,
        },
        stitch_type_id: stitch?.id,
        stitch_type_code: stitch?.code,
        yarns,
        files: densityPart.files ?? {},
        notes,
      });

      const updated = await localProgramsApi.m1Knowledge();
      setKnowledge(updated);
      setInfo(`Medição salva · ${formatDensityBar(result.measurement.density.walesPer10cm, result.measurement.density.coursesPer10cm)}`);

      const primaryYarn = yarns[0];
      if (primaryYarn && machine.cms) {
        const similarResult = await localProgramsApi.m1Similar({
          syntech_cod: primaryYarn.syntechCod ?? undefined,
          yarn_key: primaryYarn.sinDescriptionKey,
          cms: machine.cms,
          gauge: machine.gauge,
          stitch: stitch?.code,
        });
        setSimilar(similarResult.items);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="m1-page">
      {!localMode && (
        <p className="warn">Abra pelo Iniciar.bat (127.0.0.1) para ler .sin e .setx.</p>
      )}
      {localMode && scannerOk === false && (
        <p className="warn">Scanner local offline — Iniciar.bat fechado?</p>
      )}
      {localMode && scannerOk && !m1Supported && (
        <p className="warn">Reinicie o Iniciar.bat para ativar Desenv-M1 (scanner v26).</p>
      )}

      <form className="load-row card" onSubmit={(e) => void loadReference(e)}>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder="Referência (ex.: 5534)"
        />
        <label className="check-row">
          <input type="checkbox" checked={fullSearch} onChange={(e) => setFullSearch(e.target.checked)} />
          Busca completa
        </label>
        <button type="submit" className="btn btn-primary" disabled={loading || !m1Supported}>
          {loading ? 'Carregando…' : 'Carregar'}
        </button>
      </form>

      {info && <p className="info">{info}</p>}
      {error && <p className="error">{error}</p>}

      {parts.length > 0 && (
        <>
          <div className="meta-row card">
            <span>{modelName}</span>
            <span>{densityPart?.machine?.label ?? '—'}</span>
            <span>
              {densityPart?.files?.sin ? `.sin ✓` : '.sin —'}
              {' · '}
              {densityPart?.files?.setx ? `.setx ✓` : '.setx —'}
              {' · '}
              {densityPart?.files?.jac ? `.jac ✓` : '.jac —'}
              {' · '}
              {densityPart?.files?.simx ? `.simx ✓` : '.simx —'}
            </span>
          </div>

          <div className="part-row">
            <label>
              Parte
              <select
                value={selectedPartKey}
                onChange={(e) => void onSelectPart(e.target.value)}
                disabled={loadingPart}
              >
                {parts.map((p) => (
                  <option key={p.key} value={p.key}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {loadingPart && <span className="muted">Lendo .sin…</span>}
          </div>

          <div className="grid-2">
            <section className="card">
              <h2>Pano (manual)</h2>
              <div className="field-row">
                <label>
                  Largura cm
                  <input value={widthCm} onChange={(e) => setWidthCm(e.target.value)} inputMode="decimal" />
                </label>
                <label>
                  Altura cm
                  <input value={heightCm} onChange={(e) => setHeightCm(e.target.value)} inputMode="decimal" />
                </label>
              </div>
              <label className="block-label">
                Tipo de ponto
                <select value={stitchTypeId} onChange={(e) => setStitchTypeId(e.target.value)}>
                  <option value="">—</option>
                  {knowledge?.stitchTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block-label">
                Observação
                <input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </section>

            <section className="card">
              <h2>Programa</h2>
              <div className="field-row">
                <label>
                  Malhas
                  <input value={walesOverride} onChange={(e) => setWalesOverride(e.target.value)} inputMode="numeric" />
                </label>
                <label>
                  Passadas
                  <input value={coursesOverride} onChange={(e) => setCoursesOverride(e.target.value)} inputMode="numeric" />
                </label>
              </div>
              <p className="muted small">{sourceLabel(densityPart)}</p>
              {densityPart?.regulation?.ydf != null && (
                <p className="small">YDF={densityPart.regulation.ydf}</p>
              )}
            </section>
          </div>

          {densityPreview && (
            <section className="card density-result">
              <strong>{formatDensityBar(densityPreview.walesPer10cm, densityPreview.coursesPer10cm)}</strong>
            </section>
          )}

          {graduacao && graduacao.rows.length > 0 && (
            <section className="card graduacao-card">
              <div className="graduacao-head">
                <h2>Graduação</h2>
                <span className="graduacao-source">
                  Fonte: .{graduacao.source}
                  {graduacao.source === 'setx' ? ' (prioritário)' : ''}
                  {!densityPart?.files?.setx && graduacao.source === 'sin' && ' · sem .setx'}
                </span>
              </div>
              <table className="np-table">
                <thead>
                  <tr>
                    <th>NP</th>
                    <th>Valor</th>
                    <th>Descrição</th>
                    {graduacao.source === 'setx' && <th>.sin</th>}
                  </tr>
                </thead>
                <tbody>
                  {graduacao.rows.map((row) => {
                    const highlight = npHighlightForStitch(row, selectedStitch?.name);
                    const sinRow = graduacao.sinByNp.get(row.np);
                    return (
                      <tr key={row.np} className={highlight ? 'np-highlight' : undefined}>
                        <td className="mono">NP{row.np}</td>
                        <td className="mono">{formatNpValue(row.value)}</td>
                        <td>{row.label || '—'}</td>
                        {graduacao.source === 'setx' && (
                          <td className="mono muted-cell">
                            {sinRow ? formatNpValue(sinRow.value) : '—'}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(graduacao.mseci != null || graduacao.npj) && (
                <p className="graduacao-meta small muted">
                  {graduacao.mseci != null && <>MSECI={formatNpValue(graduacao.mseci)}</>}
                  {graduacao.npj?.front && <> · NPJ frente: {graduacao.npj.front}</>}
                  {graduacao.npj?.rear && <> · NPJ verso: {graduacao.npj.rear}</>}
                </p>
              )}
              {graduacao.msec.length > 0 && (
                <>
                  <h3 className="graduacao-sub">MSEC (.setx)</h3>
                  <table className="np-table np-table-compact">
                    <thead>
                      <tr>
                        <th>Chave</th>
                        <th>Valor</th>
                        <th>Descrição</th>
                      </tr>
                    </thead>
                    <tbody>
                      {graduacao.msec.map((row) => (
                        <tr key={row.key}>
                          <td className="mono">{row.key}</td>
                          <td className="mono">{formatNpValue(row.value)}</td>
                          <td>{row.comment || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </section>
          )}

          {graduacao && graduacao.rows.length === 0 && densityPart && (
            <section className="card">
              <h2>Graduação</h2>
              <p className="muted small">
                Nenhum NP encontrado{densityPart.files?.setx ? ' no .setx/.sin' : ' no .sin'}.
              </p>
            </section>
          )}

          {densityPart?.yarns && densityPart.yarns.length > 0 && (
            <section className="card">
              <h2>Fios</h2>
              <table className="yarn-table">
                <thead>
                  <tr>
                    <th>Bico</th>
                    <th>Descrição (.sin)</th>
                    <th>Cod.</th>
                  </tr>
                </thead>
                <tbody>
                  {densityPart.yarns.map((yarn) => {
                    const resolved = resolveYarnRow(yarnRowForMatch(yarn), yarnCatalog);
                    return (
                      <tr key={`${yarn.guide}-${yarn.letter}`}>
                        <td>{yarn.guide}</td>
                        <td>{yarn.description}</td>
                        <td>{resolved.tipo_fio_codigo ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          )}

          <div className="actions">
            <button
              type="button"
              className="btn btn-primary"
              disabled={saving || !densityPreview}
              onClick={() => void saveMeasurement()}
            >
              {saving ? 'Salvando…' : 'Salvar medição'}
            </button>
          </div>

          {(refHistory.length > 0 || similar.length > 0) && (
            <div className="grid-2 history-grid">
              {refHistory.length > 0 && (
                <section className="card">
                  <h2>Histórico desta ref</h2>
                  <ul className="hist-list">
                    {refHistory.map((row) => (
                      <li key={row.id}>
                        {row.partLabel} · {formatDensity(row.density.walesPer10cm)}/
                        {formatDensity(row.density.coursesPer10cm)} ·{' '}
                        {new Date(row.createdAt).toLocaleDateString('pt-BR')}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {similar.length > 0 && (
                <section className="card">
                  <h2>Similares</h2>
                  <ul className="hist-list">
                    {similar.map((row) => (
                      <li key={row.id}>
                        {row.reference} {row.partLabel} · {formatDensity(row.density.walesPer10cm)}/
                        {formatDensity(row.density.coursesPer10cm)}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}
        </>
      )}

      <style>{`
        .m1-page h1 { margin: 0 0 16px; font-size: 22px; }
        .load-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 14px; margin-bottom: 12px; }
        .load-row input { flex: 1; min-width: 140px; max-width: 220px; }
        .check-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: var(--muted); }
        .check-row input { width: auto; }
        .meta-row { display: flex; flex-wrap: wrap; gap: 16px; padding: 10px 14px; margin-bottom: 12px; font-size: 13px; }
        .part-row { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
        .part-row select { min-width: 160px; }
        .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px; }
        .history-grid { margin-top: 12px; }
        @media (max-width: 800px) { .grid-2 { grid-template-columns: 1fr; } }
        .card { padding: 14px; margin-bottom: 0; }
        .card h2 { margin: 0 0 10px; font-size: 14px; font-weight: 600; }
        .field-row { display: flex; gap: 12px; }
        .field-row label, .block-label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); flex: 1; }
        .block-label { margin-top: 10px; }
        .density-result { margin: 12px 0; text-align: center; font-size: 16px; }
        .graduacao-head { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
        .graduacao-head h2 { margin: 0; }
        .graduacao-source { font-size: 12px; color: var(--muted); }
        .graduacao-sub { margin: 14px 0 8px; font-size: 13px; font-weight: 600; }
        .graduacao-meta { margin: 10px 0 0; }
        .np-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .np-table th, .np-table td { text-align: left; padding: 7px 10px; border-bottom: 1px solid var(--border, #334155); }
        .np-table th { color: var(--muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; }
        .np-table-compact td, .np-table-compact th { padding: 5px 10px; }
        .np-table .mono { font-variant-numeric: tabular-nums; white-space: nowrap; }
        .np-table .muted-cell { color: var(--muted); }
        .np-table tr.np-highlight td { background: var(--accent-soft); }
        .np-table tr.np-highlight td:first-child { color: var(--accent); font-weight: 700; }
        .yarn-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .yarn-table th, .yarn-table td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border, #e5e7eb); }
        .actions { margin: 12px 0 20px; }
        .hist-list { margin: 0; padding-left: 18px; font-size: 13px; }
        .hist-list li { margin-bottom: 4px; }
        .info { color: var(--accent, #2563eb); font-size: 13px; }
        .error { color: #b91c1c; font-size: 13px; }
        .warn { color: #b45309; font-size: 13px; }
        .muted { color: var(--muted); font-size: 13px; }
        .small { font-size: 12px; }
      `}</style>
    </div>
  );
}
