import { ChangeEvent, FormEvent, useEffect, useMemo, useState } from 'react';

import { M1FabricCanvas } from '../../components/M1FabricCanvas';
import { M1MeshCanvas } from '../../components/M1MeshCanvas';
import {
  isLocalScannerAvailable,
  localProgramsApi,
  scannerSupportsM1Native,
  scannerSupportsM1Visual,
} from '../../lib/local-programs-api';
import type {
  M1BitmapCatalog,
  M1FabricLibrary,
  M1KnittSymResult,
  M1KnowledgeFile,
  M1MeshPart,
} from '../../types-programming';

type MeshView = 'symbol' | 'fabric';

type VisualSlot = 'stitch' | 'icon' | 'malhas';

const SLOT_META: { slot: VisualSlot; title: string; hint: string }[] = [
  { slot: 'stitch', title: 'Foto do ponto', hint: 'Macro do tecido / amostra' },
  { slot: 'icon', title: 'Ícone programação', hint: 'Bitmap M1 ou upload manual' },
  { slot: 'malhas', title: 'Tela Malhas', hint: 'Upload opcional (referência)' },
];

function slugId(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function DesenvM1MalhasPage() {
  const [knowledge, setKnowledge] = useState<M1KnowledgeFile | null>(null);
  const [symbols, setSymbols] = useState<M1KnittSymResult | null>(null);
  const [fabricLib, setFabricLib] = useState<M1FabricLibrary | null>(null);
  const [meshView, setMeshView] = useState<MeshView>('fabric');
  const [bitmaps, setBitmaps] = useState<M1BitmapCatalog | null>(null);
  const [selectedId, setSelectedId] = useState('');
  const [refInput, setRefInput] = useState('');
  const [partFile, setPartFile] = useState('');
  const [parts, setParts] = useState<{ label: string; file_name: string }[]>([]);
  const [meshPart, setMeshPart] = useState<M1MeshPart | null>(null);
  const [uploading, setUploading] = useState<VisualSlot | null>(null);
  const [loadingMesh, setLoadingMesh] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);
  const [visualOk, setVisualOk] = useState(false);
  const [nativeOk, setNativeOk] = useState(false);
  const localMode = isLocalScannerAvailable();

  const selected = useMemo(
    () => knowledge?.stitchTypes.find((row) => row.id === selectedId) ?? null,
    [knowledge, selectedId]
  );

  const suggestedBitmap = useMemo(() => {
    if (!selected?.code || !bitmaps?.items.length) return null;
    const code = selected.code.trim().toLowerCase();
    return (
      bitmaps.items.find((row) => row.id === slugId(code)) ??
      bitmaps.items.find((row) => row.id.includes(code) || row.label.toLowerCase().includes(code)) ??
      null
    );
  }, [selected?.code, bitmaps?.items]);

  const yarnColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of meshPart?.yarns ?? []) {
      map[row.letter.toUpperCase()] = row.color;
    }
    return map;
  }, [meshPart?.yarns]);

  const iconUrl = selected?.visual?.icon ?? suggestedBitmap?.url ?? null;

  useEffect(() => {
    if (!localMode) return;
    void localProgramsApi
      .health()
      .then((h) => {
        setScannerOk(true);
        setVisualOk(scannerSupportsM1Visual(h));
        setNativeOk(scannerSupportsM1Native(h));
      })
      .catch(() => setScannerOk(false));
  }, [localMode]);

  useEffect(() => {
    if (!localMode || !scannerOk || !visualOk) return;
    void localProgramsApi
      .m1Knowledge()
      .then((data) => {
        setKnowledge(data);
        setSelectedId((prev) => prev || data.stitchTypes[0]?.id || '');
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Erro ao carregar.'));
  }, [localMode, scannerOk, visualOk]);

  useEffect(() => {
    if (!localMode || !scannerOk || !nativeOk) return;
    void Promise.all([localProgramsApi.m1Symbols(), localProgramsApi.m1Bitmaps(), localProgramsApi.m1FabricLib()])
      .then(([sym, bmp, fabric]) => {
        setSymbols(sym);
        setBitmaps(bmp);
        setFabricLib(fabric);
      })
      .catch(() => {
        // M1 nativo opcional
      });
  }, [localMode, scannerOk, nativeOk]);

  async function refreshKnowledge(preferredId?: string) {
    const data = await localProgramsApi.m1Knowledge();
    setKnowledge(data);
    const id = preferredId ?? selectedId;
    if (id && data.stitchTypes.some((row) => row.id === id)) {
      setSelectedId(id);
    } else if (data.stitchTypes[0]) {
      setSelectedId(data.stitchTypes[0].id);
    }
  }

  async function loadProgramParts() {
    const ref = refInput.trim();
    if (!ref) return;
    setError('');
    try {
      const data = await localProgramsApi.parts(ref, true);
      setParts(data.parts);
      const first = data.parts[0];
      if (first) setPartFile(first.file_name);
      setInfo(`Programa ${ref}: ${data.parts.length} parte(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Programa não encontrado.');
    }
  }

  async function loadMesh() {
    const ref = refInput.trim();
    if (!ref || !partFile) return;
    setLoadingMesh(true);
    setError('');
    try {
      const data = await localProgramsApi.m1Mesh(ref, true, partFile);
      const part = data.part;
      if (!part?.ok || !part.rows?.length) {
        throw new Error(part?.error ?? 'Malha não encontrada.');
      }
      setMeshPart(part);
      const src = part.source === 'wkt-file' ? part.files?.wkt : part.files?.simx;
      const srcName = src?.split(/[/\\]/).pop() ?? part.source;
      setInfo(
        `Amostra · ${part.preview_rows ?? part.rows?.length ?? 0} carr × ${part.display_width ?? part.width ?? '?'} ag · ${srcName}`
      );
    } catch (err) {
      setMeshPart(null);
      setError(err instanceof Error ? err.message : 'Erro ao ler malha.');
    } finally {
      setLoadingMesh(false);
    }
  }

  async function onUpload(slot: VisualSlot, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !selectedId) return;

    setUploading(slot);
    setError('');
    try {
      await localProgramsApi.m1VisualUpload({
        stitch_id: selectedId,
        slot,
        file,
      });
      await refreshKnowledge(selectedId);
      setInfo(`${SLOT_META.find((row) => row.slot === slot)?.title ?? slot} salvo.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao enviar imagem.');
    } finally {
      setUploading(null);
    }
  }

  async function onCreateStitch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const nameInput = form.elements.namedItem('stitch-name') as HTMLInputElement;
    const codeInput = form.elements.namedItem('stitch-code') as HTMLInputElement;
    const idInput = form.elements.namedItem('stitch-id') as HTMLInputElement;
    const id = idInput.value.trim() || slugId(nameInput.value);
    if (!id) {
      setError('Informe nome do ponto.');
      return;
    }
    setError('');
    try {
      await localProgramsApi.m1StitchTypeUpsert({
        id,
        code: codeInput.value.trim() || id,
        name: nameInput.value.trim(),
      });
      await refreshKnowledge(id);
      setInfo('Tipo de ponto criado.');
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar ponto.');
    }
  }

  function applyFromMeasurement(row: M1KnowledgeFile['measurements'][number]) {
    setRefInput(row.reference);
    if (row.partBase) setPartFile(`${row.partBase}.mdv`);
    if (row.stitchTypeId) setSelectedId(row.stitchTypeId);
    setInfo(`Medição ${row.reference} ${row.partLabel} selecionada.`);
  }

  return (
    <div className="m1-malhas-page">
      {!localMode && <p className="warn">Abra pelo Iniciar.bat (127.0.0.1).</p>}
      {localMode && scannerOk === false && <p className="warn">Scanner local offline.</p>}
      {localMode && scannerOk && !visualOk && (
        <p className="warn">Reinicie o Iniciar.bat para ativar Malhas (scanner v26+).</p>
      )}
      {localMode && scannerOk && visualOk && !nativeOk && (
        <p className="warn">Reinicie o Iniciar.bat para vista tecido M1 (scanner v29).</p>
      )}

      {info && <p className="info">{info}</p>}
      {error && <p className="error">{error}</p>}

      <div className="grid-2 malhas-grid">
        <section className="card">
          <h2>Biblioteca de pontos</h2>
          <label className="block-label">
            Tipo de ponto
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {knowledge?.stitchTypes.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.code})
                </option>
              ))}
            </select>
          </label>

          <div className="visual-slots">
            {SLOT_META.map(({ slot, title, hint }) => (
              <div key={slot} className="visual-slot card inset">
                <div className="slot-head">
                  <strong>{title}</strong>
                  <span className="muted small">{hint}</span>
                </div>
                <div className="slot-preview">
                  {slot === 'icon' && iconUrl ? (
                    <img src={iconUrl} alt={title} />
                  ) : slot !== 'icon' && selected?.visual?.[slot] ? (
                    <img src={selected.visual[slot]} alt={title} />
                  ) : (
                    <span className="muted small">Sem imagem</span>
                  )}
                </div>
                {slot === 'icon' && suggestedBitmap && !selected?.visual?.icon && (
                  <p className="muted small">M1: {suggestedBitmap.label}</p>
                )}
                <label className="btn btn-ghost btn-sm upload-btn">
                  {uploading === slot ? 'Enviando…' : 'Enviar imagem'}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/bmp,image/webp,image/gif,image/svg+xml,.bmp"
                    disabled={!selectedId || uploading != null}
                    onChange={(e) => void onUpload(slot, e)}
                  />
                </label>
              </div>
            ))}
          </div>

          {nativeOk && bitmaps?.ok && (
            <p className="muted small">{bitmaps.items.length} ícones BMP do M1 disponíveis.</p>
          )}

          <form className="new-stitch-form" onSubmit={(e) => void onCreateStitch(e)}>
            <h3>Novo ponto</h3>
            <div className="field-row">
              <label>
                Nome
                <input name="stitch-name" required />
              </label>
              <label>
                Código
                <input name="stitch-code" placeholder="2x2-rib" />
              </label>
            </div>
            <label className="block-label">
              Id (opcional)
              <input name="stitch-id" placeholder="canelado-2x2" />
            </label>
            <button type="submit" className="btn btn-primary" disabled={!visualOk}>
              Criar tipo
            </button>
          </form>
        </section>

        <section className="card">
          <h2>Malha nativa M1</h2>
          <p className="muted small">Amostra do ponto (não é foto do pano). Usa .simx da parte ou .wkt com nome exato.</p>
          <div className="field-row">
            <label>
              Referência
              <input value={refInput} onChange={(e) => setRefInput(e.target.value)} placeholder="5500" />
            </label>
            <label>
              Parte
              <select value={partFile} onChange={(e) => setPartFile(e.target.value)} disabled={!parts.length}>
                {!parts.length && <option value={partFile}>{partFile || '—'}</option>}
                {parts.map((row) => (
                  <option key={row.file_name} value={row.file_name}>
                    {row.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="btn-row">
            <button type="button" className="btn btn-ghost btn-sm" disabled={!nativeOk || !refInput.trim()} onClick={() => void loadProgramParts()}>
              Partes
            </button>
            <button type="button" className="btn btn-primary btn-sm" disabled={!nativeOk || !refInput.trim() || !partFile || loadingMesh} onClick={() => void loadMesh()}>
              {loadingMesh ? 'Lendo…' : 'Ler malha'}
            </button>
          </div>

          {meshPart?.rows?.length ? (
            <div className="view-toggle">
              <button
                type="button"
                className={meshView === 'symbol' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                onClick={() => setMeshView('symbol')}
              >
                Símbolos
              </button>
              <button
                type="button"
                className={meshView === 'fabric' ? 'btn btn-primary btn-sm' : 'btn btn-ghost btn-sm'}
                disabled={!fabricLib?.ok}
                onClick={() => setMeshView('fabric')}
              >
                Tecido
              </button>
            </div>
          ) : null}

          {meshPart?.rows?.length ? (
            <>
              {meshView === 'fabric' && fabricLib?.stitches?.length ? (
                <M1FabricCanvas
                  rows={meshPart.rows}
                  stitches={fabricLib.stitches}
                  yarnColors={yarnColorMap}
                  width={meshPart.display_width ?? meshPart.width}
                />
              ) : (
                <M1MeshCanvas rows={meshPart.rows} palette={symbols?.entries ?? []} width={meshPart.display_width ?? meshPart.width} />
              )}
              {meshPart.yarns && meshPart.yarns.length > 0 && (
                <div className="yarn-legend">
                  {meshPart.yarns.map((row) => (
                    <span key={row.letter} className="yarn-chip">
                      <i style={{ background: row.color }} />
                      {row.letter}
                    </span>
                  ))}
                </div>
              )}
              {meshPart.row_count != null && meshPart.row_count > (meshPart.preview_rows ?? 0) && (
                <p className="muted small">
                  Recorte de {meshPart.preview_rows} carreiras (total {meshPart.row_count} no arquivo).
                </p>
              )}
            </>
          ) : (
            <p className="muted small">Informe referência e parte. Precisa do .simx em dados do programa.</p>
          )}

          {selected?.visual?.malhas && (
            <div className="malhas-ref card inset">
              <strong className="small">Upload — tela Malhas</strong>
              <img src={selected.visual.malhas} alt="Tela Malhas M1" />
            </div>
          )}

          {knowledge && knowledge.measurements.length > 0 && (
            <div className="meas-pick">
              <h3>Medições salvas</h3>
              <ul className="hist-list">
                {knowledge.measurements.slice(0, 8).map((row) => (
                  <li key={row.id}>
                    <button type="button" className="linkish" onClick={() => applyFromMeasurement(row)}>
                      {row.reference} {row.partLabel}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <style>{`
        .malhas-grid { align-items: start; }
        .visual-slots { display: grid; gap: 12px; margin: 16px 0; }
        .visual-slot.inset { padding: 12px; background: var(--inset); }
        .slot-head { display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px; }
        .slot-preview {
          min-height: 120px;
          display: grid;
          place-items: center;
          border: 1px dashed var(--border);
          border-radius: 8px;
          overflow: hidden;
          margin-bottom: 8px;
          background: var(--card);
        }
        .slot-preview img { max-width: 100%; max-height: 180px; object-fit: contain; }
        .upload-btn { position: relative; overflow: hidden; display: inline-block; }
        .upload-btn input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
        .new-stitch-form { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border); }
        .new-stitch-form h3 { margin: 0 0 12px; font-size: 14px; }
        .malhas-ref { margin-top: 16px; padding: 10px; }
        .malhas-ref img { width: 100%; max-height: 220px; object-fit: contain; margin-top: 8px; }
        .meas-pick { margin-top: 20px; }
        .meas-pick h3 { margin: 0 0 8px; font-size: 14px; }
        .btn-row { display: flex; gap: 8px; margin: 12px 0; flex-wrap: wrap; }
        .view-toggle { display: flex; gap: 8px; margin-bottom: 10px; }
        .yarn-legend { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
        .yarn-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--muted);
        }
        .yarn-chip i {
          width: 12px;
          height: 12px;
          border-radius: 2px;
          display: inline-block;
          border: 1px solid var(--border);
        }
        .linkish {
          background: none;
          border: none;
          color: var(--accent);
          cursor: pointer;
          padding: 0;
          font: inherit;
          text-align: left;
        }
        .hist-list { list-style: none; padding: 0; margin: 0; display: grid; gap: 6px; }
      `}</style>
    </div>
  );
}
