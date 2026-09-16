import type { CadastroCustoView } from './cadastro-pdf';

export const CADASTRO_CUSTO_CSS = `
:root { color-scheme: light; }
* { box-sizing: border-box; }
html, body { margin: 0; background: #eef1f6; color: #111; }
body {
  font-family: "Segoe UI", Tahoma, sans-serif;
  padding: 24px 16px 40px;
}
.sheet {
  max-width: 210mm;
  margin: 0 auto;
  background: #fff;
  padding: 18mm 16mm 16mm;
  box-shadow: 0 8px 28px rgba(18, 28, 46, 0.12);
}
h1 { margin: 0 0 8px; font-size: 22px; font-weight: 700; }
.company { margin: 0; color: #555; font-size: 14px; }
.meta { margin: 4px 0 0; color: #333; font-size: 14px; }
h2 { margin: 22px 0 8px; font-size: 15px; font-weight: 700; }
table { width: 100%; border-collapse: collapse; font-size: 12px; }
th, td { border: 1px solid #c5ccd6; padding: 6px 8px; text-align: left; vertical-align: top; }
th { background: #121c2e; color: #fff; font-weight: 700; }
tfoot td { background: #ebeef3; font-weight: 700; }
.num { text-align: right; white-space: nowrap; }
.obs { margin: 18px 0 0; font-size: 13px; }
.toolbar {
  max-width: 210mm;
  margin: 0 auto 14px;
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}
.toolbar input {
  flex: 1;
  min-width: 140px;
  padding: 8px 10px;
  border: 1px solid #c5ccd6;
  border-radius: 8px;
  font: inherit;
}
.toolbar button {
  border: 0;
  background: #121c2e;
  color: #fff;
  border-radius: 8px;
  padding: 8px 14px;
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.toolbar button.ghost { background: #dfe4ec; color: #121c2e; }
.erro { max-width: 210mm; margin: 0 auto 12px; color: #8a2b1f; }
@media print {
  body { background: #fff; padding: 0; }
  .toolbar, .erro { display: none !important; }
  .sheet { box-shadow: none; max-width: none; padding: 10mm; }
}
`;

function esc(value: string) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function cadastroCustoSheetHtml(view: CadastroCustoView) {
  const yarns = view.yarns.length
    ? `<h2>Fios consolidados (programa)</h2>
      <table>
        <thead><tr><th>%</th><th>Consumo total</th><th>Bico</th><th>Fio</th><th>Descrição</th><th>Partes</th></tr></thead>
        <tbody>${view.yarns
          .map(
            (row) => `<tr>
              <td class="num">${esc(row.pct)}</td>
              <td class="num">${esc(row.consumption)}</td>
              <td>${esc(row.bico)}</td>
              <td>${esc(row.letter)}</td>
              <td>${esc(row.description)}</td>
              <td>${esc(row.parts)}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>`
    : '';

  const summary = view.summary.length
    ? `<h2>Resumo para preço — peso por fio e cor</h2>
      <table>
        <thead><tr><th>Fio</th><th>Cor</th><th>Peso (kg)</th><th>%</th></tr></thead>
        <tbody>${view.summary
          .map(
            (row) => `<tr>
              <td>${esc(row.tipo)}</td>
              <td>${esc(row.cor)}</td>
              <td class="num">${esc(row.peso)}</td>
              <td class="num">${esc(row.pct)}</td>
            </tr>`
          )
          .join('')}</tbody>
        <tfoot><tr><td>Total</td><td></td><td class="num">${esc(view.summary_total_peso)}</td><td class="num">${esc(view.summary_total_pct)}</td></tr></tfoot>
      </table>`
    : '';

  const machine = view.machine_line ? `<p class="meta">${esc(view.machine_line)}</p>` : '';
  const obs = view.observations ? `<p class="obs">Obs: ${esc(view.observations)}</p>` : '';

  return `<article class="sheet">
    <h1>Ficha de Cadastro — Dados de Custo</h1>
    <p class="company">${esc(view.company)}</p>
    <p class="meta">Ref: ${esc(view.reference)} — ${esc(view.name)}</p>
    ${machine}
    <p class="meta">Atualizado: ${esc(view.updated_label)}</p>
    <table>
      <thead><tr><th>Parte</th><th>Arquivo</th><th>Tempo</th><th>Peso bruto (kg)</th></tr></thead>
      <tbody>${view.parts
        .map(
          (part) => `<tr>
            <td>${esc(part.label)}</td>
            <td>${esc(part.file_name)}</td>
            <td class="num">${esc(part.time)}</td>
            <td class="num">${esc(part.weight)}</td>
          </tr>`
        )
        .join('')}</tbody>
      <tfoot><tr><td>Total</td><td></td><td class="num">${esc(view.parts_total_time)}</td><td class="num">${esc(view.parts_total_weight)}</td></tr></tfoot>
    </table>
    ${yarns}
    ${summary}
    ${obs}
  </article>`;
}

export function buildCadastroCustoHtml(view: CadastroCustoView) {
  const title = `Ficha de custos ${view.reference}`.trim();
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${esc(title)}</title>
  <style>${CADASTRO_CUSTO_CSS}</style>
</head>
<body>
  <div class="toolbar">
    <button type="button" onclick="window.print()">Imprimir</button>
  </div>
  ${cadastroCustoSheetHtml(view)}
</body>
</html>`;
}
