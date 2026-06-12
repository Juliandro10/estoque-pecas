import { useMemo } from 'react';

type Props = {
  widthCm: number;
  heightCm: number;
  walesPer10cm: number;
  coursesPer10cm: number;
  textureUrl?: string;
  iconUrl?: string;
  label?: string;
};

export function M1SwatchPreview({
  widthCm,
  heightCm,
  walesPer10cm,
  coursesPer10cm,
  textureUrl,
  iconUrl,
  label,
}: Props) {
  const layout = useMemo(() => {
    const maxW = 420;
    const maxH = 320;
    const ratio = widthCm / heightCm;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const tileW = Math.max(8, Math.round((walesPer10cm / 10) * (w / widthCm)));
    const tileH = Math.max(8, Math.round((coursesPer10cm / 10) * (h / heightCm)));
    return { w, h, tileW, tileH };
  }, [widthCm, heightCm, walesPer10cm, coursesPer10cm]);

  return (
    <div className="swatch-wrap">
      {label && <p className="swatch-label">{label}</p>}
      <div
        className="swatch-canvas"
        style={{
          width: `${layout.w}px`,
          height: `${layout.h}px`,
          backgroundImage: textureUrl ? `url(${textureUrl})` : undefined,
          backgroundSize: textureUrl ? `${layout.tileW}px ${layout.tileH}px` : undefined,
        }}
      >
        {!textureUrl && <span className="swatch-placeholder">Sem foto do ponto</span>}
        {iconUrl && (
          <img src={iconUrl} alt="" className="swatch-icon" />
        )}
      </div>
      <p className="swatch-meta muted small">
        {widthCm.toLocaleString('pt-BR')} × {heightCm.toLocaleString('pt-BR')} cm ·{' '}
        {walesPer10cm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ag / 10 cm ·{' '}
        {coursesPer10cm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} carr / 10 cm
      </p>
      <style>{`
        .swatch-wrap { display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
        .swatch-label { margin: 0; font-weight: 700; }
        .swatch-canvas {
          position: relative;
          border: 1px solid var(--border);
          border-radius: 8px;
          background-color: var(--inset);
          background-repeat: repeat;
          overflow: hidden;
          box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04);
        }
        .swatch-placeholder {
          position: absolute;
          inset: 0;
          display: grid;
          place-items: center;
          color: var(--muted);
          font-size: 12px;
          padding: 12px;
          text-align: center;
        }
        .swatch-icon {
          position: absolute;
          top: 8px;
          right: 8px;
          width: 36px;
          height: 36px;
          object-fit: contain;
          background: rgba(0,0,0,0.45);
          border-radius: 6px;
          padding: 4px;
        }
        .swatch-meta { margin: 0; }
      `}</style>
    </div>
  );
}
