import { ensureCatalogSeeded, firestoreDb } from './firestore-db';
import type { Dashboard, MonthlyReport, Movement, Part, PartStatus, Shift, StockReport } from '../types';

let seeded = false;

async function ready() {
  if (!seeded) {
    await ensureCatalogSeeded();
    seeded = true;
  }
}

export const api = {
  dashboard: async () => {
    await ready();
    return firestoreDb.getDashboard();
  },
  parts: {
    list: async (params?: { q?: string; status?: PartStatus }) => {
      await ready();
      return firestoreDb.getParts(params);
    },
    setQuantity: async (id: string, quantity: number) => {
      await ready();
      return firestoreDb.setQuantity(id, quantity);
    },
    withdraw: async (
      id: string,
      data: {
        quantity: number;
        shift: Shift;
        withdrawn_by: string;
        machine: number;
        requested_by?: string;
        notes?: string;
      }
    ) => {
      await ready();
      return firestoreDb.withdraw(id, data);
    },
  },
  withdrawals: {
    list: async (shift?: Shift) => {
      await ready();
      return firestoreDb.getWithdrawals(shift);
    },
    update: async (
      id: string,
      data: {
        quantity: number;
        shift: Shift;
        withdrawn_by: string;
        machine: number;
        requested_by?: string;
        notes?: string;
      }
    ) => {
      await ready();
      return firestoreDb.updateWithdrawal(id, data);
    },
    remove: async (id: string) => {
      await ready();
      return firestoreDb.deleteWithdrawal(id);
    },
  },
  report: async () => {
    await ready();
    return firestoreDb.getReport();
  },
  monthlyReport: async (month: string) => {
    await ready();
    return firestoreDb.getMonthlyReport(month);
  },
};

export type { Dashboard, MonthlyReport, Movement, Part, StockReport };
