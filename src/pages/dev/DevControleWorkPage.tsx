import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { exportProgrammingPdf } from '../../lib/programming-report-export';
import { isLocalScannerAvailable, localProgramsApi } from '../../lib/local-programs-api';
import { programmingDb } from '../../lib/programming-db';
import type { JobKind, ProgramEntry, ProgramMonthlyReport, WorkType } from '../../types-programming';
import { formatJobKindLabel, JOB_KIND_OPTIONS, PROGRAM_VALUE } from '../../types-programming';

type Props = {
  workType: WorkType;
};

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthOptions(count = 12) {
  const options: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = 0; i < count; i++) {
    options.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    d.setMonth(d.getMonth() - 1);
  }
  return options;
}

function formatMonthOption(key: string) {
  const [year, month] = key.split('-').map(Number);
  const names = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
  ];
  return `${names[month - 1]} ${year}`;
}

function formatBr(iso: string) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function formatMoney(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function DevControleWorkPage({ workType }: Props) {
  const isExtra = workType === 'extra';
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<ProgramEntry[]>([]);
  const [reference, setReference] = useState('');
  const [jobKind, setJobKind] = useState<JobKind>('novo');
  const [jobKindNote, setJobKindNote] = useState('');
  const [fullSearch, setFullSearch] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);

  const options = useMemo(() => monthOptions(), []);
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const paidTotal = rows.filter((r) => r.paid).reduce((sum, r) => sum + r.value, 0);
  const pendingTotal = total - paidTotal;
  const paidCount = rows.filter((r) => r.paid).length;
  const localMode = isLocalScannerAvailable();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await programmingDb.listByMonth(month, workType));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      setLoading(false);
    }
  }, [month, workType]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!localMode) {
      setScannerOk(false);
      return;
    }
    localProgramsApi
      .health()
      .then(() => setScannerOk(true))
      .catch(() => setScannerOk(false));
  }, [localMode]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    const ref = reference.trim();
    if (!ref) return;

    if (jobKind === 'outro' && !jobKindNote.trim()) {
      setError('Informe a descrição quando o tipo for Outro.');
      return;
    }

    if (!localMode || !scannerOk) {
      setError('Busca na pasta PROGRAMAS só funciona pelo atalho local (Iniciar.bat).');
      return;
    }

    setSubmitting(true);
    setError('');
    setInfo('');
    try {
      const found = await localProgramsApi.lookup(ref, fullSearch);
      const saved = await programmingDb.add({
        reference: found.reference,
        name: found.name,
        date: found.date,
        work_type: workType,
        job_kind: jobKind,
        job_kind_note: jobKind === 'outro' ? jobKindNote : undefined,
      });
      setReference('');
      setJobKindNote('');
      setInfo(`${saved.reference} — ${saved.name} (${formatBr(saved.start_date)})`);
      if (saved.month !== month) setMonth(saved.month);
      else await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao lançar.');
    } finally {
      setSubmitting(false);
    }
  }

  async function remove(row: ProgramEntry) {
    if (!confirm(`Apagar ${row.reference} — ${row.name}?`)) return;
    try {
      await programmingDb.remove(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao apagar.');
    }
  }

  async function togglePaid(row: ProgramEntry) {
    try {
      await programmingDb.setPaid(row.id, !row.paid);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pagamento.');
    }
  }

  async function saveDates(row: ProgramEntry, startDate: string, endDate: string) {
    if (startDate === row.start_date && endDate === row.end_date) return;
    try {
      await programmingDb.updateDates(row.id, startDate, endDate);
      setError('');
      const nextMonth = startDate.slice(0, 7);
      if (nextMonth !== month) {
        setInfo(`${row.reference} movido para ${formatMonthOption(nextMonth)}.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar data.');
      await load();
    }
  }

  async function exportReport() {
    try {
      const report: ProgramMonthlyReport = await programmingDb.getMonthlyReport(month, workType);
      if (report.total_programs === 0) {
        setError('Nenhum programa neste mês para exportar.');
        return;
      }
      exportProgrammingPdf(report);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar PDF.');
    }
  }

  return (
    <div>
      <p className="section-desc">
        {isExtra
          ? `Programas extras — R$ ${PROGRAM_VALUE.toFixed(2).replace('.', ',')} por modelo`
          : 'Programas feitos no horário normal do dia'}
      </p>

      {localMode ? (
        scannerOk ? (
          <div className="info-box">Pasta PROGRAMAS conectada · busca nos últimos 15 dias</div>
        ) : (
          <div className="error-box">
            Scanner local offline. Use o atalho Iniciar.bat (sobe painel + leitor de programas).
          </div>
        )
      ) : (
        <div className="info-box">Modo online: consulta e relatório. Para lançar, use o atalho local.</div>
      )}

      {error ? <div className="error-box">{error}</div> : null}
      {info ? <div className="info-box">{info}</div> : null}

      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {options.map((key) => (
            <option key={key} value={key}>
              {formatMonthOption(key)}
            </option>
          ))}
        </select>
        <button type="button" className="btn btn-ghost" onClick={() => void exportReport()}>
          PDF do mês
        </button>
      </div>

      <form className="card add-form" onSubmit={(e) => void handleAdd(e)}>
        <div className="add-row">
          <input
            placeholder="Referência (ex.: 5402)"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            disabled={submitting || !scannerOk}
          />
          <select
            value={jobKind}
            onChange={(e) => {
              const next = e.target.value as JobKind;
              setJobKind(next);
              if (next !== 'outro') setJobKindNote('');
            }}
            disabled={submitting || !scannerOk}
            title="Tipo de trabalho"
          >
            {JOB_KIND_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          {jobKind === 'outro' ? (
            <input
              className="outro-note"
              placeholder="Descreva o trabalho…"
              value={jobKindNote}
              onChange={(e) => setJobKindNote(e.target.value)}
              disabled={submitting || !scannerOk}
            />
          ) : null}
          <button type="submit" className="btn" disabled={submitting || !scannerOk}>
            {submitting ? 'Buscando…' : 'Lançar'}
          </button>
        </div>
        <label className="check-row">
          <input
            type="checkbox"
            checked={fullSearch}
            onChange={(e) => setFullSearch(e.target.checked)}
            disabled={submitting}
          />
          Busca completa (ignora os 15 dias — mais lenta)
        </label>
      </form>

      <div className="card table-wrap">
        {loading ? (
          <div className="empty">Carregando…</div>
        ) : rows.length === 0 ? (
          <div className="empty">Nenhum programa lançado neste mês.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Referência</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Data início</th>
                <th>Data término</th>
                {isExtra ? <th>Valor</th> : null}
                {isExtra ? <th>Pago</th> : null}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className={row.paid ? 'row-paid' : undefined}>
                  <td className="mono">{row.reference}</td>
                  <td>{row.name}</td>
                  <td>{formatJobKindLabel(row.job_kind, row.job_kind_note)}</td>
                  <td>
                    <input
                      type="date"
                      className="date-edit"
                      value={row.start_date}
                      title="Data início"
                      onChange={(e) => {
                        const nextStart = e.target.value;
                        if (!nextStart) return;
                        const nextEnd = row.end_date < nextStart ? nextStart : row.end_date;
                        void saveDates(row, nextStart, nextEnd);
                      }}
                    />
                  </td>
                  <td>
                    <input
                      type="date"
                      className="date-edit"
                      value={row.end_date}
                      min={row.start_date}
                      title="Data término"
                      onChange={(e) => {
                        const nextEnd = e.target.value;
                        if (!nextEnd) return;
                        void saveDates(row, row.start_date, nextEnd);
                      }}
                    />
                  </td>
                  {isExtra ? <td>{formatMoney(row.value)}</td> : null}
                  {isExtra ? (
                    <td className="paid-cell">
                      <label className="paid-check" title={row.paid ? 'Marcado como pago' : 'Marcar como pago'}>
                        <input
                          type="checkbox"
                          checked={row.paid}
                          onChange={() => void togglePaid(row)}
                        />
                        <span>{row.paid ? 'Sim' : '—'}</span>
                      </label>
                    </td>
                  ) : null}
                  <td>
                    <button type="button" className="btn btn-danger btn-sm" onClick={() => void remove(row)}>
                      Apagar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
            {isExtra ? (
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total ({rows.length} programas)
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatMoney(total)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger, #dc2626)' }}>
                    Pago ({paidCount})
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--danger, #dc2626)' }}>{formatMoney(paidTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={5} style={{ textAlign: 'right', fontWeight: 700 }}>
                    A pagar ({rows.length - paidCount})
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatMoney(pendingTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            ) : (
              <tfoot>
                <tr>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total: {rows.length} programas
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        )}
      </div>

      <style>{`
        .section-desc { margin: 0 0 16px; color: var(--muted); font-size: 14px; }
        .add-form { padding: 16px; margin-bottom: 16px; }
        .add-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .add-row input { flex: 1; min-width: 140px; max-width: none; }
        .add-row select { min-width: 200px; max-width: 260px; }
        .add-row .outro-note { flex: 1; min-width: 180px; max-width: none; }
        .check-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--muted); }
        .check-row input { width: auto; }
        .info-box {
          margin-bottom: 14px;
          padding: 12px 14px;
          border-radius: 10px;
          background: rgba(45, 212, 191, 0.12);
          color: var(--mint);
          font-size: 14px;
        }
        tfoot td { border-bottom: none; }
        .row-paid td { opacity: 0.72; }
        .row-paid .paid-cell { opacity: 1; }
        .paid-cell { white-space: nowrap; }
        .paid-check {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
          font-size: 13px;
          color: var(--muted);
        }
        .paid-check input { width: auto; cursor: pointer; }
        .row-paid .paid-check span { color: var(--danger, #dc2626); font-weight: 600; }
        .date-edit {
          width: 140px;
          max-width: 100%;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          background: var(--bg-elevated, rgba(0,0,0,0.25));
          color: inherit;
          font: inherit;
          font-size: 13px;
        }
        .date-edit:focus {
          outline: 2px solid rgba(45, 212, 191, 0.45);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
