import { useEffect, useMemo, useState } from 'react';

import { api } from '../lib/api';
import {
  exportAnalysisPdf,
  exportAnalysisTxt,
  exportReplenishmentPdf,
  exportReplenishmentTxt,
} from '../lib/monthly-report-export';
import { needleQty, peakNeedleMachine, sortedByMachineNeedles, withdrawalsMissingMachine } from '../lib/machine-report';
import type { MonthlyReport } from '../types';
import { SHIFT_LABELS } from '../types';

function previousMonth() {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
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

export function MonthlyReportsPage() {
  const [month, setMonth] = useState(previousMonth);
  const [report, setReport] = useState<MonthlyReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const options = useMemo(() => monthOptions(), []);

  useEffect(() => {
    setLoading(true);
    api.monthlyReport(month)
      .then(setReport)
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [month]);

  if (error) return <div className="error-box">{error}</div>;
  if (loading || !report) return <div className="loader">Carregando relatório mensal…</div>;

  const peak = report.peak_shift ? SHIFT_LABELS[report.peak_shift] : '—';
  const byMachine = sortedByMachineNeedles(report.by_machine ?? []);
  const peakMachine = peakNeedleMachine(byMachine);
  const missingMachine = withdrawalsMissingMachine(report);

  return (
    <div>
      <header className="page-header">
        <div>
          <h1>Relatórios mensais</h1>
          <p>Reposição para compras · Análise de quebras por turno</p>
        </div>
      </header>

      <div className="filters">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {options.map((key) => (
            <option key={key} value={key}>
              {formatMonthOption(key)}
            </option>
          ))}
        </select>
      </div>

      <div className="report-meta">
        {report.period_label} · {report.total_withdrawn} peças saíram · {report.total_records}{' '}
        retiradas · turno com mais saídas: <strong>{peak}</strong>
        {peakMachine ? (
          <> · máquina com mais agulhas: <strong>Máq. {peakMachine.machine} ({peakMachine.qty})</strong></>
        ) : null}
      </div>

      <section className="report-section">
        <h2>Reposição (Compras)</h2>
        <p className="section-desc">Quantidade a repor por peça e por turno.</p>
        <div className="export-actions">
          <button type="button" className="btn" onClick={() => exportReplenishmentTxt(report)}>
            Reposição TXT
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => exportReplenishmentPdf(report)}>
            Reposição PDF
          </button>
        </div>
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código</th>
                <th>Peça</th>
                <th>Total</th>
                <th>Cedo</th>
                <th>Tarde</th>
                <th>Noite</th>
              </tr>
            </thead>
            <tbody>
              {report.by_part.length === 0 ? (
                <tr>
                  <td colSpan={6} className="empty">
                    Nenhuma retirada neste mês.
                  </td>
                </tr>
              ) : (
                report.by_part.map((p) => (
                  <tr key={p.part_id}>
                    <td className="mono">{p.part_code}</td>
                    <td>{p.part_name}</td>
                    <td>{p.total_qty}</td>
                    <td>{p.by_shift.cedo}</td>
                    <td>{p.by_shift.tarde}</td>
                    <td>{p.by_shift.noite}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="report-section">
        <h2>Análise de quebras</h2>
        <p className="section-desc">Consumo por turno e por funcionário.</p>
        <div className="export-actions">
          <button type="button" className="btn" onClick={() => exportAnalysisTxt(report)}>
            Análise TXT
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => exportAnalysisPdf(report)}>
            Análise PDF
          </button>
        </div>

        <div className="card table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th colSpan={5}>Por máquina</th>
              </tr>
              <tr>
                <th>Máquina</th>
                <th>Agulhas</th>
                <th>Total peças</th>
                <th>Retiradas</th>
                <th>Principais peças</th>
              </tr>
            </thead>
            <tbody>
              {byMachine.length === 0 ? (
                <tr>
                  <td colSpan={5} className="empty">
                    Nenhuma retirada com máquina informada neste mês.
                  </td>
                </tr>
              ) : (
                byMachine.map((m) => (
                  <tr key={m.machine}>
                    <td>Máq. {m.machine}</td>
                    <td>{needleQty(m) || '—'}</td>
                    <td>{m.total_qty}</td>
                    <td>{m.records}</td>
                    <td>
                      {m.parts
                        .slice(0, 3)
                        .map((p) => `${p.part_code} (${p.total_qty})`)
                        .join(' · ') || '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {missingMachine > 0 ? (
          <p className="section-desc">
            {missingMachine} retirada(s) sem máquina — não entram no ranking acima.
          </p>
        ) : null}

        <div className="card table-wrap" style={{ marginBottom: 16 }}>
          <table>
            <thead>
              <tr>
                <th colSpan={4}>Por turno</th>
              </tr>
              <tr>
                <th>Turno</th>
                <th>Peças</th>
                <th>Retiradas</th>
                <th>Principais peças</th>
              </tr>
            </thead>
            <tbody>
              {report.by_shift.map((s) => (
                <tr key={s.shift}>
                  <td>{SHIFT_LABELS[s.shift]}</td>
                  <td>{s.total_qty}</td>
                  <td>{s.records}</td>
                  <td>
                    {s.parts
                      .slice(0, 3)
                      .map((p) => `${p.part_code} (${p.total_qty})`)
                      .join(' · ') || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="analysis-grid">
          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th colSpan={5}>Quem retirou</th>
                </tr>
                <tr>
                  <th>Nome</th>
                  <th>Total</th>
                  <th>Cedo</th>
                  <th>Tarde</th>
                  <th>Noite</th>
                </tr>
              </thead>
              <tbody>
                {report.by_withdrawn_by.map((e) => (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td>{e.total_qty}</td>
                    <td>{e.by_shift.cedo}</td>
                    <td>{e.by_shift.tarde}</td>
                    <td>{e.by_shift.noite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card table-wrap">
            <table>
              <thead>
                <tr>
                  <th colSpan={5}>Quem solicitou</th>
                </tr>
                <tr>
                  <th>Nome</th>
                  <th>Total</th>
                  <th>Cedo</th>
                  <th>Tarde</th>
                  <th>Noite</th>
                </tr>
              </thead>
              <tbody>
                {report.by_requested_by.map((e) => (
                  <tr key={e.name}>
                    <td>{e.name}</td>
                    <td>{e.total_qty}</td>
                    <td>{e.by_shift.cedo}</td>
                    <td>{e.by_shift.tarde}</td>
                    <td>{e.by_shift.noite}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <style>{`
        .section-desc {
          margin: 0 0 12px;
          color: var(--muted);
          font-size: 14px;
        }
        .analysis-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        @media (max-width: 900px) {
          .analysis-grid { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
