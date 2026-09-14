import type { ProducaoBoard } from '../src/types-programming.ts';

export const PAINEL_FIRESTORE_COLLECTION = 'tecelagem_publico';
export const PAINEL_FIRESTORE_DOCUMENT = 'quadro';
export const PAINEL_PUBLISH_EMAIL = 'tecelagem@controle-tricot-e-cia.web.app';

export type PainelPublico = {
  updated_at: string;
  machines: Array<{
    numero: number;
    agora: {
      programa: string;
      pedido: number | null;
      item_op: number;
      restante: number;
      fila_ordens: number;
      ops_no_pedido: number;
      previsao_pedido: string | null;
      livre_em: string | null;
    } | null;
    parada: {
      motivo: string;
      obs: string;
      familia: 'mecanica' | 'processo';
    } | null;
    sugestao: {
      pedido: number | null;
      programa: string;
      prazo: string | null;
      entra_em: string | null;
    } | null;
  }>;
  espera: Array<{
    pedido: number | null;
    referencia: string;
    prazo: string | null;
    restante: number;
    atrasado: boolean;
    sugestao_maquina: number | null;
    sugestao_entra_em: string | null;
  }>;
};

export function toPainelPublico(board: ProducaoBoard): PainelPublico {
  return {
    updated_at: board.updated_at,
    machines: (board.machines ?? [])
      .filter((machine) => !machine.grupo)
      .map((machine) => ({
        numero: machine.numero,
        agora: machine.agora
          ? {
              programa: machine.agora.programa,
              pedido: machine.agora.pedido,
              item_op: machine.agora.item_op,
              restante: machine.agora.restante,
              fila_ordens: machine.agora.fila_ordens,
              ops_no_pedido: machine.agora.ops_no_pedido,
              previsao_pedido: machine.agora.previsao_pedido,
              livre_em: machine.agora.livre_em,
            }
          : null,
        parada: machine.parada
          ? {
              motivo: machine.parada.motivo,
              obs: machine.parada.obs,
              familia: machine.parada.familia,
            }
          : null,
        sugestao: machine.sugestao
          ? {
              pedido: machine.sugestao.pedido,
              programa: machine.sugestao.programa,
              prazo: machine.sugestao.prazo,
              entra_em: machine.sugestao.entra_em,
            }
          : null,
      })),
    espera: (board.pedidos ?? [])
      .filter((pedido) => (pedido.maquinas?.length ?? 0) === 0 && pedido.restante > 0)
      .map((pedido) => ({
        pedido: pedido.pedido,
        referencia: pedido.referencias[0] ?? '—',
        prazo: pedido.prazo,
        restante: pedido.restante,
        atrasado: pedido.atrasado,
        sugestao_maquina: pedido.sugestao_maquina,
        sugestao_entra_em: pedido.sugestao_entra_em,
      })),
  };
}
