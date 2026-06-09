import type { Part } from '../types';

function status(part: Pick<Part, 'quantity' | 'min_quantity'>) {
  if (part.quantity === 0) return 'zerado' as const;
  if (part.min_quantity > 0 && part.quantity < part.min_quantity) return 'baixo' as const;
  return 'ok' as const;
}

export function StockBadge({ part }: { part: Pick<Part, 'quantity' | 'min_quantity'> }) {
  const s = status(part);
  if (s === 'zerado') return <span className="badge badge-danger">Zerado</span>;
  if (s === 'baixo') return <span className="badge badge-warn">Baixo</span>;
  return <span className="badge badge-ok">OK</span>;
}
