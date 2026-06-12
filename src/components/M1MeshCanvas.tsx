import { useEffect, useMemo, useRef } from 'react';

import type { M1KnittSymEntry, M1MeshRow } from '../types-programming';

type Props = {
  rows: M1MeshRow[];
  palette: M1KnittSymEntry[];
  width?: number | null;
  maxHeight?: number;
  cellSize?: number;
  className?: string;
};

function paletteMap(entries: M1KnittSymEntry[]) {
  const map = new Map<string, string>();
  for (const row of entries) {
    if (!map.has(`${row.char}:${row.mode}`)) {
      map.set(`${row.char}:${row.mode}`, row.color);
    }
    if (!map.has(row.char)) map.set(row.char, row.color);
  }
  map.set('.', 'rgb(255, 255, 255)');
  map.set(' ', 'rgb(255, 255, 255)');
  map.set('-', 'rgb(240, 240, 240)');
  map.set('=', 'rgb(230, 230, 230)');
  return map;
}

export function M1MeshCanvas({ rows, palette, width, maxHeight = 320, cellSize, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const colors = useMemo(() => paletteMap(palette), [palette]);

  const meshWidth = useMemo(() => {
    if (width && width > 0) return width;
    return rows.reduce((max, row) => Math.max(max, row.mesh.length), 0);
  }, [rows, width]);

  const pxCell = useMemo(() => {
    if (cellSize && cellSize > 0) return cellSize;
    return Math.max(2, Math.min(4, Math.floor(280 / Math.max(meshWidth, 1))));
  }, [cellSize, meshWidth]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || rows.length === 0 || meshWidth <= 0) return;

    const height = rows.length;
    canvas.width = meshWidth * pxCell;
    canvas.height = height * pxCell;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let y = 0; y < rows.length; y++) {
      const mesh = rows[y]?.mesh ?? '';
      for (let x = 0; x < meshWidth; x++) {
        const ch = mesh[x] ?? '.';
        ctx.fillStyle = colors.get(ch) ?? 'rgb(210, 210, 210)';
        ctx.fillRect(x * pxCell, y * pxCell, pxCell, pxCell);
      }
    }
  }, [rows, meshWidth, pxCell, colors]);

  if (!rows.length) {
    return <p className="muted small">Sem linhas de malha.</p>;
  }

  return (
    <div className={className ?? 'mesh-canvas-wrap'}>
      <canvas
        ref={canvasRef}
        className="mesh-canvas"
        style={{
          maxHeight,
          maxWidth: '100%',
          width: meshWidth * pxCell,
          height: rows.length * pxCell,
          imageRendering: 'pixelated',
        }}
        aria-label="Amostra de malha M1"
      />
      <style>{`
        .mesh-canvas-wrap {
          overflow: auto;
          border: 1px solid var(--border);
          border-radius: 8px;
          background: #fff;
          padding: 8px;
          display: flex;
          justify-content: center;
        }
        .mesh-canvas {
          display: block;
        }
      `}</style>
    </div>
  );
}
