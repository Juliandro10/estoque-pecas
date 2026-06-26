import cors from 'cors';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importCatalog, readCatalogFile } from './catalog.js';
import { getMonthlyReport, previousMonthKey } from './monthly-report.js';
import { store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3847;
const HOST = '127.0.0.1';

const app = express();
app.use(cors({ origin: [`http://${HOST}:5174`, `http://localhost:5174`] }));
app.use(express.json());

const catalog = readCatalogFile();
if ((catalog.parts?.length ?? 0) > 0) {
  importCatalog({ preserveQuantity: true });
}

app.get('/api/dashboard', (_req, res) => {
  res.json(store.getDashboard());
});

app.get('/api/parts', (req, res) => {
  const status = req.query.status as 'baixo' | 'zerado' | 'ok' | undefined;
  res.json(
    store.getParts({
      q: String(req.query.q ?? ''),
      status: status && ['baixo', 'zerado', 'ok'].includes(status) ? status : undefined,
    })
  );
});

app.post('/api/parts/:id/withdraw', (req, res) => {
  const { quantity, shift, withdrawn_by, requested_by, notes, machine } = req.body;
  try {
    const result = store.withdraw(Number(req.params.id), {
      quantity: Number(quantity),
      shift,
      withdrawn_by,
      machine: Number(machine),
      requested_by,
      notes,
    });
    if (!result) {
      res.status(404).json({ error: 'Peça não encontrada.' });
      return;
    }
    res.status(201).json({
      part: result.part,
      withdrawal: store.enrichMovement(result.movement),
    });
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_STOCK') {
        res.status(400).json({ error: 'Quantidade maior que o estoque disponível.' });
        return;
      }
      if (err.message === 'INVALID_QUANTITY') {
        res.status(400).json({ error: 'Informe a quantidade retirada.' });
        return;
      }
      if (err.message === 'MISSING_WITHDRAWN_BY') {
        res.status(400).json({ error: 'Informe quem retirou.' });
        return;
      }
      if (err.message === 'INVALID_SHIFT') {
        res.status(400).json({ error: 'Turno inválido.' });
        return;
      }
      if (err.message === 'INVALID_MACHINE') {
        res.status(400).json({ error: 'Informe a máquina (1 a 15).' });
        return;
      }
    }
    res.status(500).json({ error: 'Erro ao registrar retirada.' });
  }
});

app.put('/api/parts/:id/quantity', (req, res) => {
  const quantity = Number(req.body.quantity);
  if (Number.isNaN(quantity)) {
    res.status(400).json({ error: 'Quantidade inválida.' });
    return;
  }
  try {
    const result = store.setQuantity(Number(req.params.id), quantity, req.body.reason);
    if (!result) {
      res.status(404).json({ error: 'Peça não encontrada.' });
      return;
    }
    res.json(result.part);
  } catch (err) {
    if (err instanceof Error && err.message === 'NEGATIVE_STOCK') {
      res.status(400).json({ error: 'Quantidade não pode ser negativa.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao atualizar quantidade.' });
  }
});

app.get('/api/movements', (_req, res) => {
  res.json(store.getMovements(100));
});

app.get('/api/withdrawals', (req, res) => {
  const shift = req.query.shift as 'cedo' | 'tarde' | 'noite' | undefined;
  res.json(
    store.getWithdrawals({
      shift: shift && ['cedo', 'tarde', 'noite'].includes(shift) ? shift : undefined,
    })
  );
});

app.put('/api/withdrawals/:id', (req, res) => {
  const { quantity, shift, withdrawn_by, requested_by, notes, machine } = req.body;
  try {
    const result = store.updateWithdrawal(Number(req.params.id), {
      quantity: Number(quantity),
      shift,
      withdrawn_by,
      machine: Number(machine),
      requested_by,
      notes,
    });
    if (!result) {
      res.status(404).json({ error: 'Retirada não encontrada.' });
      return;
    }
    res.json(result);
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === 'INSUFFICIENT_STOCK') {
        res.status(400).json({ error: 'Quantidade maior que o estoque disponível.' });
        return;
      }
      if (err.message === 'INVALID_QUANTITY') {
        res.status(400).json({ error: 'Informe a quantidade retirada.' });
        return;
      }
      if (err.message === 'MISSING_WITHDRAWN_BY') {
        res.status(400).json({ error: 'Informe quem retirou.' });
        return;
      }
      if (err.message === 'INVALID_SHIFT') {
        res.status(400).json({ error: 'Turno inválido.' });
        return;
      }
      if (err.message === 'INVALID_MACHINE') {
        res.status(400).json({ error: 'Informe a máquina (1 a 15).' });
        return;
      }
    }
    res.status(500).json({ error: 'Erro ao atualizar retirada.' });
  }
});

app.delete('/api/withdrawals/:id', (req, res) => {
  const result = store.deleteWithdrawal(Number(req.params.id));
  if (!result) {
    res.status(404).json({ error: 'Retirada não encontrada.' });
    return;
  }
  res.json(result);
});

app.get('/api/report', (_req, res) => {
  res.json(store.getReport());
});

app.get('/api/reports/monthly', (req, res) => {
  const month = String(req.query.month ?? previousMonthKey());
  if (!/^\d{4}-\d{2}$/.test(month)) {
    res.status(400).json({ error: 'Mês inválido. Use o formato AAAA-MM.' });
    return;
  }
  res.json(getMonthlyReport(month));
});

const distPath = path.join(__dirname, '..', 'dist');
const distIndex = path.join(distPath, 'index.html');
const servePanel = fs.existsSync(distIndex);

if (servePanel) {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(distIndex);
  });
}

app.listen(PORT, HOST, () => {
  const url = `http://${HOST}:${PORT}`;
  if (servePanel) {
    console.log(`Painel: ${url}`);
  } else {
    console.log(`API: ${url} | Rode "npm run dev" ou "npm run build" + reinicie`);
  }
});
