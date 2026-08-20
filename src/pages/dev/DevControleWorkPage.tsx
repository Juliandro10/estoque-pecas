import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';

import { exportProgrammingPdf } from '../../lib/programming-report-export';
import { isLocalScannerAvailable, localProgramsApi } from '../../lib/local-programs-api';
import { programmingClientsDb } from '../../lib/programming-clients-db';
import { buildReportFromEntries, formatDayLabel, programmingDb, resolveReportTotalScope } from '../../lib/programming-db';
import type { JobKind, ProgramEntry, ProgramMonthlyReport, ProgrammingClient, WorkType } from '../../types-programming';
import {
  DEFAULT_PROGRAM_CLIENT_ID,
  formatJobKindLabel,
  formatMoneyInput,
  JOB_KIND_OPTIONS,
  parseMoneyInput,
  PROGRAM_VALUE,
} from '../../types-programming';

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

function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function weekStartMonday(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function toIsoDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function currentWeekRange(reference = new Date()) {
  const start = weekStartMonday(reference);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return { start: toIsoDate(start), end: toIsoDate(end) };
}

function entryInDateRange(entry: ProgramEntry, start: string, end: string) {
  return entry.start_date >= start && entry.start_date <= end;
}

function periodLabelFromRange(start: string, end: string) {
  if (start === end) return formatBr(start);
  return `${formatBr(start)} a ${formatBr(end)}`;
}

function pdfFileTagFromRange(start: string, end: string) {
  if (start === end) return start;
  return `${start}_a_${end}`;
}

export function DevControleWorkPage({ workType }: Props) {
  const isExtra = workType === 'extra';
  const [month, setMonth] = useState(currentMonth);
  const [rows, setRows] = useState<ProgramEntry[]>([]);
  const [clients, setClients] = useState<ProgrammingClient[]>([]);
  const [clientFilter, setClientFilter] = useState('');
  const [selectedClientId, setSelectedClientId] = useState(DEFAULT_PROGRAM_CLIENT_ID);
  const [programValue, setProgramValue] = useState(formatMoneyInput(PROGRAM_VALUE));
  const [reference, setReference] = useState('');
  const [jobKind, setJobKind] = useState<JobKind>('novo');
  const [jobKindNote, setJobKindNote] = useState('');
  const [fullSearch, setFullSearch] = useState(false);
  const [showClientManager, setShowClientManager] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientValue, setNewClientValue] = useState(formatMoneyInput(PROGRAM_VALUE));
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [scannerOk, setScannerOk] = useState<boolean | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [customRangeStart, setCustomRangeStart] = useState(todayIso);
  const [customRangeEnd, setCustomRangeEnd] = useState(todayIso);
  const [pdfSelectionMode, setPdfSelectionMode] = useState<'manual' | 'day' | 'week' | 'custom'>('manual');

  const options = useMemo(() => monthOptions(), []);
  const selectedClient = useMemo(
    () => clients.find((client) => client.id === selectedClientId) ?? null,
    [clients, selectedClientId]
  );
  const total = rows.reduce((sum, r) => sum + r.value, 0);
  const paidTotal = rows.filter((r) => r.paid).reduce((sum, r) => sum + r.value, 0);
  const pendingTotal = total - paidTotal;
  const paidCount = rows.filter((r) => r.paid).length;
  const localMode = isLocalScannerAvailable();
  const showClientColumn = isExtra && !clientFilter;
  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.has(row.id)),
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  const someVisibleSelected = rows.some((row) => selectedIds.has(row.id));

  const loadClients = useCallback(async () => {
    if (!isExtra) return;
    const list = await programmingClientsDb.list();
    setClients(list);
    setSelectedClientId((current) =>
      list.some((client) => client.id === current) ? current : list[0]?.id ?? DEFAULT_PROGRAM_CLIENT_ID
    );
  }, [isExtra]);

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      setRows(await programmingDb.listByMonth(month, workType, clientFilter || null));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar.');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, [month, workType, clientFilter]);

  useEffect(() => {
    void load();
    setSelectedIds(new Set());
  }, [load]);

  useEffect(() => {
    if (!isExtra) return;
    void loadClients().catch((err) => {
      setError(err instanceof Error ? err.message : 'Erro ao carregar clientes.');
    });
  }, [isExtra, loadClients]);

  useEffect(() => {
    if (!selectedClient) return;
    setProgramValue(formatMoneyInput(selectedClient.default_value));
  }, [selectedClient]);

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

    if (isExtra) {
      const parsedValue = parseMoneyInput(programValue);
      if (parsedValue === null) {
        setError('Informe um valor válido para o programa.');
        return;
      }
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
        client_id: isExtra ? selectedClientId : undefined,
        value: isExtra ? parseMoneyInput(programValue) ?? undefined : undefined,
      });
      setReference('');
      setJobKindNote('');
      setInfo(
        `${saved.reference} — ${saved.name} (${formatBr(saved.start_date)})${isExtra ? ` · ${saved.client_name} · ${formatMoney(saved.value)}` : ''}`
      );
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
      await load({ silent: true });
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
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar data.');
      await load({ silent: true });
    }
  }

  async function saveValue(row: ProgramEntry, raw: string) {
    const parsed = parseMoneyInput(raw);
    if (parsed === null) {
      setError('Valor inválido.');
      await load({ silent: true });
      return;
    }
    if (parsed === row.value) return;
    try {
      await programmingDb.updateValue(row.id, parsed);
      setError('');
      await load({ silent: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar valor.');
      await load({ silent: true });
    }
  }

  async function addClient(e: FormEvent) {
    e.preventDefault();
    const parsed = parseMoneyInput(newClientValue);
    if (parsed === null) {
      setError('Informe um valor padrão válido para o cliente.');
      return;
    }
    try {
      const created = await programmingClientsDb.add(newClientName, parsed);
      setNewClientName('');
      setNewClientValue(formatMoneyInput(PROGRAM_VALUE));
      setSelectedClientId(created.id);
      setClientFilter(created.id);
      await loadClients();
      setInfo(`Cliente ${created.name} adicionado.`);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar cliente.');
    }
  }

  async function saveClientDefault(client: ProgrammingClient, raw: string) {
    const parsed = parseMoneyInput(raw);
    if (parsed === null) {
      setError('Valor padrão inválido.');
      return;
    }
    if (parsed === client.default_value) return;
    try {
      await programmingClientsDb.update(client.id, { default_value: parsed });
      await loadClients();
      if (selectedClientId === client.id) {
        setProgramValue(formatMoneyInput(parsed));
      }
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar cliente.');
    }
  }

  function toggleRowSelection(id: string, checked: boolean) {
    setPdfSelectionMode('manual');
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleSelectAllVisible(checked: boolean) {
    setPdfSelectionMode('manual');
    setSelectedIds(checked ? new Set(rows.map((row) => row.id)) : new Set());
  }

  function selectByDateRange(start: string, end: string, mode: 'day' | 'week' | 'custom' = 'custom') {
    const rangeStart = start <= end ? start : end;
    const rangeEnd = end >= start ? end : start;
    setCustomRangeStart(rangeStart);
    setCustomRangeEnd(rangeEnd);
    setPdfSelectionMode(mode);
    setSelectedIds(
      new Set(rows.filter((row) => entryInDateRange(row, rangeStart, rangeEnd)).map((row) => row.id))
    );
  }

  function selectToday() {
    const today = todayIso();
    selectByDateRange(today, today, 'day');
  }

  function selectCurrentWeek() {
    const { start, end } = currentWeekRange();
    selectByDateRange(start, end, 'week');
  }

  function clearSelection() {
    setPdfSelectionMode('manual');
    setSelectedIds(new Set());
  }

  async function exportSelectedPdf() {
    if (selectedRows.length === 0) {
      setError('Selecione ao menos um programa para gerar o PDF.');
      return;
    }

    try {
      const sorted = [...selectedRows].sort((a, b) => a.start_date.localeCompare(b.start_date));
      const rangeStart = sorted[0].start_date;
      const rangeEnd = sorted[sorted.length - 1].start_date;
      let clientName: string | null = null;
      if (clientFilter) {
        const client = await programmingClientsDb.get(clientFilter);
        clientName = client?.name ?? sorted[0]?.client_name ?? null;
      }

      const totalScope = resolveReportTotalScope(
        rangeStart,
        rangeEnd,
        pdfSelectionMode === 'day' ? 'day' : pdfSelectionMode === 'week' ? 'week' : null
      );

      const report = buildReportFromEntries(
        selectedRows,
        workType,
        clientFilter || null,
        rangeStart === rangeEnd
          ? formatDayLabel(rangeStart)
          : periodLabelFromRange(rangeStart, rangeEnd),
        clientName,
        'day',
        totalScope
      );
      exportProgrammingPdf(report, { fileTag: `selecao-${pdfFileTagFromRange(rangeStart, rangeEnd)}` });
      setError('');
      setInfo(`PDF gerado com ${selectedRows.length} programa(s).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao gerar PDF.');
    }
  }

  async function exportReport() {
    try {
      const report: ProgramMonthlyReport = await programmingDb.getMonthlyReport(
        month,
        workType,
        clientFilter || null
      );
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
          ? 'Programas extras por cliente — valor editável por modelo'
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
        {isExtra ? (
          <select value={clientFilter} onChange={(e) => setClientFilter(e.target.value)} title="Filtrar por cliente">
            <option value="">Todos os clientes</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        ) : null}
        <button type="button" className="btn btn-ghost" onClick={() => void exportReport()}>
          PDF do mês
        </button>
        {isExtra ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => setShowClientManager((open) => !open)}
          >
            {showClientManager ? 'Fechar clientes' : 'Clientes'}
          </button>
        ) : null}
      </div>

      <div className="pdf-selection-bar card">
        <div className="pdf-selection-actions">
          <span className="pdf-selection-label">Seleção para PDF</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={selectToday}>
            Hoje
          </button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={selectCurrentWeek}>
            Semana
          </button>
          <label className="pdf-range-field">
            De
            <input
              type="date"
              value={customRangeStart}
              onChange={(e) => setCustomRangeStart(e.target.value)}
            />
          </label>
          <label className="pdf-range-field">
            Até
            <input
              type="date"
              value={customRangeEnd}
              min={customRangeStart}
              onChange={(e) => setCustomRangeEnd(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={() => selectByDateRange(customRangeStart, customRangeEnd, 'custom')}
          >
            Personalizado
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={clearSelection}
            disabled={selectedIds.size === 0}
          >
            Limpar
          </button>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => void exportSelectedPdf()}
            disabled={selectedIds.size === 0}
          >
            Gerar PDF{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
          </button>
        </div>
        <p className="pdf-selection-hint">
          Marque linhas na tabela ou use Hoje, Semana ou Personalizado. O PDF inclui só os selecionados.
        </p>
      </div>

      {isExtra && showClientManager ? (
        <div className="card client-panel">
          <h3>Clientes</h3>
          <p className="client-panel-desc">Cada cliente pode ter um valor padrão diferente por programa.</p>
          <div className="client-list">
            {clients.map((client) => (
              <div key={client.id} className="client-row">
                <strong>{client.name}</strong>
                <label className="client-default">
                  Padrão R$
                  <input
                    key={`${client.id}-${client.default_value}`}
                    defaultValue={formatMoneyInput(client.default_value)}
                    onBlur={(e) => void saveClientDefault(client, e.target.value)}
                  />
                </label>
              </div>
            ))}
          </div>
          <form className="client-add" onSubmit={(e) => void addClient(e)}>
            <input
              placeholder="Nome do cliente"
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
            />
            <input
              placeholder="Valor padrão"
              value={newClientValue}
              onChange={(e) => setNewClientValue(e.target.value)}
            />
            <button type="submit" className="btn btn-sm">
              Adicionar
            </button>
          </form>
        </div>
      ) : null}

      <form className="card add-form" onSubmit={(e) => void handleAdd(e)}>
        <div className="add-row">
          {isExtra ? (
            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              disabled={submitting || !scannerOk}
              title="Cliente"
            >
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          ) : null}
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
          {isExtra ? (
            <input
              className="value-input"
              placeholder="Valor"
              value={programValue}
              onChange={(e) => setProgramValue(e.target.value)}
              disabled={submitting || !scannerOk}
              title="Valor do programa"
            />
          ) : null}
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
                <th className="select-col">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected;
                    }}
                    onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                    title="Selecionar todos visíveis"
                  />
                </th>
                <th>Referência</th>
                <th>Descrição</th>
                {showClientColumn ? <th>Cliente</th> : null}
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
                <tr
                  key={row.id}
                  className={row.paid ? 'row-paid' : undefined}
                  data-selected={selectedIds.has(row.id) || undefined}
                >
                  <td className="select-col">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(row.id)}
                      onChange={(e) => toggleRowSelection(row.id, e.target.checked)}
                      title={`Selecionar ${row.reference}`}
                    />
                  </td>
                  <td className="mono">{row.reference}</td>
                  <td>{row.name}</td>
                  {showClientColumn ? <td>{row.client_name}</td> : null}
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
                  {isExtra ? (
                    <td>
                      <input
                        key={`${row.id}-${row.value}`}
                        className="value-edit"
                        defaultValue={formatMoneyInput(row.value)}
                        onBlur={(e) => void saveValue(row, e.target.value)}
                        title="Valor do programa"
                      />
                    </td>
                  ) : null}
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
                  <td colSpan={showClientColumn ? 7 : 6} style={{ textAlign: 'right', fontWeight: 700 }}>
                    Total ({rows.length} programas)
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatMoney(total)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td
                    colSpan={showClientColumn ? 7 : 6}
                    style={{ textAlign: 'right', fontWeight: 700, color: 'var(--danger, #dc2626)' }}
                  >
                    Pago ({paidCount})
                  </td>
                  <td style={{ fontWeight: 700, color: 'var(--danger, #dc2626)' }}>{formatMoney(paidTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
                <tr>
                  <td colSpan={showClientColumn ? 7 : 6} style={{ textAlign: 'right', fontWeight: 700 }}>
                    A pagar ({rows.length - paidCount})
                  </td>
                  <td style={{ fontWeight: 700 }}>{formatMoney(pendingTotal)}</td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            ) : (
              <tfoot>
                <tr>
                  <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700 }}>
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
        .filters { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 16px; align-items: center; }
        .pdf-selection-bar {
          padding: 14px 16px;
          margin-bottom: 16px;
        }
        .pdf-selection-actions {
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
          align-items: center;
        }
        .pdf-selection-label {
          font-size: 13px;
          font-weight: 700;
          color: var(--muted);
          margin-right: 4px;
        }
        .pdf-range-field {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-size: 13px;
          color: var(--muted);
        }
        .pdf-range-field input {
          width: 140px;
          padding: 6px 8px;
          border-radius: 8px;
          border: 1px solid var(--border, rgba(255,255,255,0.12));
          background: var(--bg-elevated, rgba(0,0,0,0.25));
          color: inherit;
          font: inherit;
          font-size: 13px;
        }
        .pdf-selection-hint {
          margin: 10px 0 0;
          font-size: 12px;
          color: var(--muted);
        }
        .select-col {
          width: 36px;
          text-align: center;
        }
        .select-col input {
          width: auto;
          cursor: pointer;
        }
        tr[data-selected] {
          background: rgba(45, 212, 191, 0.08);
        }
        .client-panel { padding: 16px; margin-bottom: 16px; }
        .client-panel h3 { margin: 0 0 6px; font-size: 15px; }
        .client-panel-desc { margin: 0 0 12px; color: var(--muted); font-size: 13px; }
        .client-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .client-row { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
        .client-default { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
        .client-default input { width: 96px; }
        .client-add { display: flex; gap: 10px; flex-wrap: wrap; }
        .client-add input { flex: 1; min-width: 140px; }
        .add-form { padding: 16px; margin-bottom: 16px; }
        .add-row { display: flex; gap: 10px; flex-wrap: wrap; }
        .add-row input { flex: 1; min-width: 140px; max-width: none; }
        .add-row select { min-width: 160px; max-width: 220px; }
        .add-row .value-input { flex: 0 0 110px; min-width: 110px; max-width: 110px; }
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
        .date-edit, .value-edit {
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
        .value-edit { width: 96px; }
        .date-edit:focus, .value-edit:focus {
          outline: 2px solid rgba(45, 212, 191, 0.45);
          outline-offset: 1px;
        }
      `}</style>
    </div>
  );
}
