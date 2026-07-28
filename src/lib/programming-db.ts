import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';

import { db } from '../firebase';
import type {
  ProgramEntry,
  ProgramMonthlyReport,
  ProgramWeekGroup,
  WorkType,
  JobKind,
} from '../types-programming';
import { PROGRAM_VALUE } from '../types-programming';

const programsCol = collection(db, 'programs');

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function mapProgram(id: string, data: Record<string, unknown>): ProgramEntry {
  const workType = (data.work_type as WorkType | undefined) ?? 'extra';
  const rawKind = data.job_kind as JobKind | undefined;
  const jobKind =
    rawKind && ['novo', 'ajuste', 'graduacao', 'outro'].includes(rawKind) ? rawKind : null;
  return {
    id,
    reference: String(data.reference ?? ''),
    name: String(data.name ?? ''),
    job_kind: jobKind,
    job_kind_note: jobKind === 'outro' ? String(data.job_kind_note ?? '').trim() || null : null,
    start_date: String(data.start_date ?? ''),
    end_date: String(data.end_date ?? ''),
    value: Number(data.value ?? (workType === 'extra' ? PROGRAM_VALUE : 0)),
    month: String(data.month ?? ''),
    work_type: workType,
    paid: data.paid === true,
    paid_at:
      data.paid_at instanceof Timestamp
        ? data.paid_at.toDate().toISOString()
        : data.paid === true
          ? String(data.paid_at ?? '')
          : null,
    created_at: data.created_at instanceof Timestamp
      ? data.created_at.toDate().toISOString()
      : String(data.created_at ?? new Date().toISOString()),
  };
}

function monthKeyFromDate(isoDate: string) {
  const [y, m] = isoDate.split('-');
  return `${y}-${m}`;
}

function parseIsoDate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function weekStartMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function buildWeekLabel(start: Date, end: Date) {
  const startDay = start.getDate();
  const endDay = end.getDate();
  const monthName = MONTH_NAMES[start.getMonth()];
  const yearSuffix = start.getFullYear() !== end.getFullYear() ? ` de ${end.getFullYear()}` : '';
  if (start.getMonth() === end.getMonth()) {
    return `Semana de ${startDay} a ${endDay} de ${monthName}${yearSuffix}`;
  }
  const endMonth = MONTH_NAMES[end.getMonth()];
  return `Semana de ${startDay} de ${monthName} a ${endDay} de ${endMonth}${yearSuffix}`;
}

function groupByWeek(entries: ProgramEntry[]): ProgramWeekGroup[] {
  const sorted = [...entries].sort((a, b) => a.start_date.localeCompare(b.start_date));
  const groups = new Map<string, ProgramWeekGroup>();

  for (const entry of sorted) {
    const date = parseIsoDate(entry.start_date);
    const ws = weekStartMonday(date);
    const we = new Date(ws);
    we.setDate(we.getDate() + 6);

    const key = ws.toISOString().slice(0, 10);
    if (!groups.has(key)) {
      groups.set(key, {
        label: buildWeekLabel(ws, we),
        start: ws.toISOString().slice(0, 10),
        end: we.toISOString().slice(0, 10),
        entries: [],
        subtotal: 0,
        paid_subtotal: 0,
        all_paid: false,
      });
    }
    const group = groups.get(key)!;
    group.entries.push(entry);
    group.subtotal += entry.value;
    if (entry.paid) group.paid_subtotal += entry.value;
  }

  for (const group of groups.values()) {
    group.all_paid = group.entries.length > 0 && group.entries.every((entry) => entry.paid);
  }

  return [...groups.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function docId(month: string, workType: WorkType, reference: string) {
  return `${month}_${workType}_${reference}`;
}

function newEntryId(month: string, workType: WorkType, reference: string) {
  if (workType === 'normal') {
    return `${month}_normal_${reference}_${Date.now()}`;
  }
  return docId(month, workType, reference);
}

export const programmingDb = {
  listByMonth: async (month: string, workType: WorkType) => {
    const q = query(programsCol, where('month', '==', month));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => mapProgram(d.id, d.data()))
      .filter((row) => row.work_type === workType)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  },

  existsInMonth: async (month: string, workType: WorkType, reference: string) => {
    const id = docId(month, workType, reference.trim());
    const snap = await getDoc(doc(programsCol, id));
    if (snap.exists()) return true;

    const legacyId = `${month}_${reference.trim()}`;
    if (workType === 'extra') {
      const legacy = await getDoc(doc(programsCol, legacyId));
      return legacy.exists();
    }
    return false;
  },

  add: async (input: {
    reference: string;
    name: string;
    date: string;
    work_type: WorkType;
    job_kind: JobKind;
    job_kind_note?: string;
    value?: number;
  }) => {
    const reference = input.reference.trim();
    const month = monthKeyFromDate(input.date);
    const workType = input.work_type;
    const note = input.job_kind_note?.trim() ?? '';
    if (input.job_kind === 'outro' && !note) {
      throw new Error('Informe a descrição quando o tipo for Outro.');
    }
    if (workType === 'extra') {
      const exists = await programmingDb.existsInMonth(month, workType, reference);
      if (exists) {
        throw new Error(`Referência ${reference} já lançada em ${month} (Extra).`);
      }
    }

    const id = newEntryId(month, workType, reference);
    const value = input.value ?? (workType === 'extra' ? PROGRAM_VALUE : 0);

    await setDoc(doc(programsCol, id), {
      reference,
      name: input.name.trim(),
      job_kind: input.job_kind,
      job_kind_note: input.job_kind === 'outro' ? note : null,
      start_date: input.date,
      end_date: input.date,
      value,
      month,
      work_type: workType,
      paid: false,
      paid_at: null,
      created_at: serverTimestamp(),
    });

    const saved = await getDoc(doc(programsCol, id));
    return mapProgram(saved.id, saved.data()!);
  },

  remove: async (id: string) => {
    await deleteDoc(doc(programsCol, id));
  },

  setPaid: async (id: string, paid: boolean) => {
    await updateDoc(doc(programsCol, id), {
      paid,
      paid_at: paid ? serverTimestamp() : null,
    });
  },

  updateDates: async (id: string, startDate: string, endDate: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new Error('Data inválida.');
    }
    if (endDate < startDate) {
      throw new Error('Data de término não pode ser anterior à de início.');
    }
    await updateDoc(doc(programsCol, id), {
      start_date: startDate,
      end_date: endDate,
      month: monthKeyFromDate(startDate),
    });
  },

  getMonthlyReport: async (month: string, workType: WorkType): Promise<ProgramMonthlyReport> => {
    const entries = await programmingDb.listByMonth(month, workType);
    const weeks = groupByWeek(entries);
    const [year, mon] = month.split('-').map(Number);
    const paidEntries = entries.filter((entry) => entry.paid);
    const paid_value = paidEntries.reduce((sum, entry) => sum + entry.value, 0);
    const total_value = entries.reduce((sum, entry) => sum + entry.value, 0);

    return {
      month,
      period_label: `${MONTH_NAMES[mon - 1]}/${year}`,
      generated_at: new Date().toISOString(),
      work_type: workType,
      weeks,
      total_programs: entries.length,
      total_value,
      paid_programs: paidEntries.length,
      paid_value,
      pending_programs: entries.length - paidEntries.length,
      pending_value: total_value - paid_value,
    };
  },
};
