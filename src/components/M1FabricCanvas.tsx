import { useEffect, useMemo, useRef } from 'react';

import type { M1FabricStitchDef, M1MeshRow } from '../types-programming';

type Props = {
  rows: M1MeshRow[];
  stitches: M1FabricStitchDef[];
  yarnColors: Record<string, string>;
  width?: number | null;
  maxHeight?: number;
  className?: string;
};

const MATRIX_SIZE = 9;

function stitchMap(stitches: M1FabricStitchDef[]) {
  const map = new Map<string, M1FabricStitchDef>();
  for (const row of stitches) map.set(row.char, row);
  return map;
}

function tintShades(yarnHex: string) {
  const yarn = hexToRgb(yarnHex);
  return {
    highlight: mixCss(yarn, { r: 255, g: 255, b: 255 }, 0.45),
    body: rgbCss(yarn),
    shadow: mixCss(yarn, { r: 0, g: 0, b: 0 }, 0.38),
  };
}

function hexToRgb(hex: string) {
  const clean = hex.replace('#', '').trim();
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const n = Number.parseInt(full, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbCss({ r, g, b }: { r: number; g: number; b: number }) {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

function mixCss(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) {
  return rgbCss({
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  });
}

function pickYarn(char: string, yarnColors: Record<string, string>) {
  const key = char.trim().toUpperCase();
  if (key && yarnColors[key]) return yarnColors[key];
  if (yarnColors.A) return yarnColors.A;
  return Object.values(yarnColors)[0] ?? '#234e82';
}

function colorForMatrixValue(
  value: number,
  shades: { highlight: string; body: string; shadow: string },
  empty: boolean
) {
  if (empty) return '#ffffff';
  if (value >= 3) return shades.body;
  if (value >= 2) return shades.shadow;
  return shades.highlight;
}

export function M1FabricCanvas({ rows, stitches, yarnColors, width, maxHeight = 360, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const defs = useMemo(() => stitchMap(stitches), [stitches]);

  const meshWidth = useMemo(() => {
    if (width && width > 0) return width;
    return rows.reduce((max, row) => Math.max(max, row.mesh.length), 0);
  }, [rows, width]);

  const pxPerCell = useMemo(() => Math.max(2, Math.min(3, Math.floor(320 / Math.max(meshWidth, 1)))), [meshWidth]);
  const stitchPx = MATRIX_SIZE * pxPerCell;
  const rowShift = Math.floor(pxPerCell / 2);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !rows.length || meshWidth <= 0) return;

    const rowShift = Math.floor(pxPerCell / 2);
    canvas.width = meshWidth * stitchPx + rowShift;
    canvas.height = rows.length * stitchPx;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows.length; y++) {
      const mesh = rows[y]?.mesh ?? '';
      const offsetX = y % 2 === 1 ? rowShift : 0;

      for (let x = 0; x < meshWidth; x++) {
        const ch = mesh[x] ?? '.';
        const def = defs.get(ch) ?? defs.get('.');
        if (!def) continue;

        const empty = ch === '.' || ch === ' ';
        const yarn = pickYarn(ch, yarnColors);
        const shades = empty
          ? { highlight: '#ffffff', body: '#f4f4f4', shadow: '#e8e8e8' }
          : tintShades(yarn);

        const matrix = def.matrix;
        for (let my = 0; my < MATRIX_SIZE; my++) {
          for (let mx = 0; mx < MATRIX_SIZE; mx++) {
            const value = matrix[my]?.[mx] ?? 1;
            ctx.fillStyle = colorForMatrixValue(value, shades, empty);
            ctx.fillRect(
              offsetX + x * stitchPx + mx * pxPerCell,
              y * stitchPx + my * pxPerCell,
              pxPerCell,
              pxPerCell
            );
          }
        }
      }
    }
  }, [rows, meshWidth, pxPerCell, stitchPx, defs, yarnColors, rowShift]);

  if (!rows.length) {
    return <p className="muted small">Sem linhas de malha.</p>;
  }

  return (
    <div className={className ?? 'mesh-canvas-wrap fabric'}>
      <canvas
        ref={canvasRef}
        className="mesh-canvas"
        style={{
          maxHeight,
          maxWidth: '100%',
          imageRendering: 'pixelated',
        }}
        aria-label="Vista tecido M1"
      />
      <style>{`
        .mesh-canvas-wrap.fabric {
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 8px;
          display: flex;
          justify-content: center;
        }
        .mesh-canvas-wrap.fabric .mesh-canvas { display: block; }
      `}</style>
    </div>
  );
}
