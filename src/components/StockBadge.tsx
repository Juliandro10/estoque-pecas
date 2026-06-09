import type { Part } from '../types';

export function StockBadge({ part }: { part: Pick<Part, 'quantity' | 'min_quantity'> }) {
  if (part.quantity === 0) {
    return <span className="badge badge-danger">Zerado</span>;
  }
  if (part.min_quantity > 0 && part.quantity <= part.min_quantity) {
    return <span className="badge badge-warn">Baixo</span>;
  }
  return <span className="badge badge-ok">OK</span>;
}
