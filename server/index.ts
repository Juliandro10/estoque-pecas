import cors from 'cors';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { importCatalog, readCatalogFile } from './catalog.js';
import { store } from './store.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3847;
const HOST = '127.0.0.1';

const app = express();
app.use(cors({ origin: [`http://${HOST}:5174`, `http://localhost:5174`] }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, local: true });
});

app.get('/api/dashboard', (_req, res) => {
  const data = store.getDashboard();
  res.json({
    ...data,
    lowStockParts: data.lowStockParts.map(store.enrichPart),
    recentMovements: data.recentMovements.map(store.enrichMovement),
  });
});

app.get('/api/machines', (_req, res) => {
  res.json(store.getMachines());
});

app.post('/api/machines', (req, res) => {
  const { code, name, location, notes } = req.body;
  if (!code?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'Código e nome são obrigatórios.' });
    return;
  }
  try {
    const row = store.createMachine({
      code: code.trim(),
      name: name.trim(),
      location: location?.trim() || null,
      notes: notes?.trim() || null,
    });
    res.status(201).json(row);
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_MACHINE') {
      res.status(409).json({ error: 'Código de máquina já existe.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao criar máquina.' });
  }
});

app.put('/api/machines/:id', (req, res) => {
  const id = Number(req.params.id);
  const { code, name, location, notes } = req.body;
  if (!code?.trim() || !name?.trim()) {
    res.status(400).json({ error: 'Código e nome são obrigatórios.' });
    return;
  }
  try {
    const row = store.updateMachine(id, {
      code: code.trim(),
      name: name.trim(),
      location: location?.trim() || null,
      notes: notes?.trim() || null,
    });
    if (!row) {
      res.status(404).json({ error: 'Máquina não encontrada.' });
      return;
    }
    res.json(row);
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_MACHINE') {
      res.status(409).json({ error: 'Código de máquina já existe.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao atualizar máquina.' });
  }
});

app.delete('/api/machines/:id', (req, res) => {
  const ok = store.deleteMachine(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Máquina não encontrada.' });
    return;
  }
  res.status(204).end();
});

app.get('/api/parts', (req, res) => {
  const rows = store
    .getParts({
      q: String(req.query.q ?? ''),
      machineId: req.query.machineId ? Number(req.query.machineId) : undefined,
      lowOnly: req.query.lowOnly === '1',
    })
    .map(store.enrichPart);
  res.json(rows);
});

app.get('/api/parts/:id', (req, res) => {
  const row = store.getPart(Number(req.params.id));
  if (!row) {
    res.status(404).json({ error: 'Peça não encontrada.' });
    return;
  }
  res.json(store.enrichPart(row));
});

app.post('/api/parts', (req, res) => {
  const body = req.body;
  if (!body.code?.trim() || !body.name?.trim()) {
    res.status(400).json({ error: 'Código e nome são obrigatórios.' });
    return;
  }
  try {
    const row = store.createPart({
      code: body.code.trim(),
      name: body.name.trim(),
      description: body.description?.trim() || null,
      quantity: Number(body.quantity ?? 0),
      min_quantity: Number(body.min_quantity ?? 0),
      unit: body.unit?.trim() || 'un',
      location: body.location?.trim() || null,
      machine_id: body.machine_id ?? null,
      supplier: body.supplier?.trim() || null,
      unit_cost: body.unit_cost != null ? Number(body.unit_cost) : null,
      notes: body.notes?.trim() || null,
    });
    res.status(201).json(store.enrichPart(row));
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_PART') {
      res.status(409).json({ error: 'Código de peça já existe.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao criar peça.' });
  }
});

app.put('/api/parts/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = req.body;
  if (!body.code?.trim() || !body.name?.trim()) {
    res.status(400).json({ error: 'Código e nome são obrigatórios.' });
    return;
  }
  try {
    const row = store.updatePart(id, {
      code: body.code.trim(),
      name: body.name.trim(),
      description: body.description?.trim() || null,
      min_quantity: Number(body.min_quantity ?? 0),
      unit: body.unit?.trim() || 'un',
      location: body.location?.trim() || null,
      machine_id: body.machine_id ?? null,
      supplier: body.supplier?.trim() || null,
      unit_cost: body.unit_cost != null ? Number(body.unit_cost) : null,
      notes: body.notes?.trim() || null,
    });
    if (!row) {
      res.status(404).json({ error: 'Peça não encontrada.' });
      return;
    }
    res.json(store.enrichPart(row));
  } catch (err) {
    if (err instanceof Error && err.message === 'DUPLICATE_PART') {
      res.status(409).json({ error: 'Código de peça já existe.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao atualizar peça.' });
  }
});

app.delete('/api/parts/:id', (req, res) => {
  const ok = store.deletePart(Number(req.params.id));
  if (!ok) {
    res.status(404).json({ error: 'Peça não encontrada.' });
    return;
  }
  res.status(204).end();
});

app.get('/api/movements', (req, res) => {
  const partId = req.query.partId ? Number(req.query.partId) : undefined;
  const rows = store.getMovements(partId).map(store.enrichMovement);
  res.json(rows);
});

app.post('/api/movements', (req, res) => {
  const { part_id, type, quantity, reason, reference } = req.body;
  if (!part_id || !type || quantity == null || Number.isNaN(Number(quantity))) {
    res.status(400).json({ error: 'Dados da movimentação inválidos.' });
    return;
  }
  const qty = Number(quantity);
  if (qty <= 0 && type !== 'adjust') {
    res.status(400).json({ error: 'Quantidade deve ser maior que zero.' });
    return;
  }
  try {
    const result = store.createMovement({
      part_id,
      type,
      quantity: qty,
      reason: reason?.trim() || null,
      reference: reference?.trim() || null,
    });
    if (!result) {
      res.status(404).json({ error: 'Peça não encontrada.' });
      return;
    }
    res.status(201).json({
      movement: store.enrichMovement(result.movement),
      part: store.enrichPart(result.part),
    });
  } catch (err) {
    if (err instanceof Error && err.message === 'NEGATIVE_STOCK') {
      res.status(400).json({ error: 'Estoque não pode ficar negativo.' });
      return;
    }
    res.status(500).json({ error: 'Erro ao registrar movimentação.' });
  }
});

const distPath = path.join(__dirname, '..', 'dist');
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distPath));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

const catalog = readCatalogFile();
const hasCatalog = (catalog.parts?.length ?? 0) > 0 || (catalog.machines?.length ?? 0) > 0;
if (hasCatalog && store.getParts().length === 0) {
  const result = importCatalog({ preserveQuantity: true });
  console.log(
    `Catálogo carregado: ${result.partsAdded} peças, ${result.machinesAdded} máquinas`
  );
}

app.listen(PORT, HOST, () => {
  console.log(`API local: http://${HOST}:${PORT}`);
  console.log(`Dados: ${path.join(__dirname, '..', 'data', 'estoque.json')}`);
  console.log(`Catálogo: ${path.join(__dirname, '..', 'data', 'catalogo.json')}`);
});
