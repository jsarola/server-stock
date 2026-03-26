const express = require('express');
const path = require('path');
const { initDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Init DB
const db = initDb();

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── API ROUTES ───────────────────────────────────────────────────────────────

// GET all servers
app.get('/api/servers', (req, res) => {
  const servers = db.prepare('SELECT * FROM servers ORDER BY name').all();
  res.json(servers);
});

// GET single server
app.get('/api/servers/:id', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!server) return res.status(404).json({ error: 'Server not found' });
  res.json(server);
});

// POST create server
app.post('/api/servers', (req, res) => {
  const { name, vcpus, memory, disk0, disk1, disk_extra, disk_total, servei, tipus, equip, data_baixa } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  try {
    const stmt = db.prepare(`
      INSERT INTO servers (name, vcpus, memory, disk0, disk1, disk_extra, disk_total, servei, tipus, equip, data_baixa)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      name, vcpus || 0, memory || 0, disk0 || 0, disk1 || 0,
      disk_extra || 0, disk_total || 0, servei || '', tipus || '', equip || '', data_baixa || ''
    );
    const created = db.prepare('SELECT * FROM servers WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json(created);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Server name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT update server
app.put('/api/servers/:id', (req, res) => {
  const { name, vcpus, memory, disk0, disk1, disk_extra, disk_total, servei, tipus, equip, data_baixa } = req.body;
  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Server not found' });

  try {
    db.prepare(`
      UPDATE servers SET
        name = ?, vcpus = ?, memory = ?, disk0 = ?, disk1 = ?,
        disk_extra = ?, disk_total = ?, servei = ?, tipus = ?, equip = ?,
        data_baixa = ?, updated_at = datetime('now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      vcpus ?? existing.vcpus,
      memory ?? existing.memory,
      disk0 ?? existing.disk0,
      disk1 ?? existing.disk1,
      disk_extra ?? existing.disk_extra,
      disk_total ?? existing.disk_total,
      servei ?? existing.servei,
      tipus ?? existing.tipus,
      equip ?? existing.equip,
      data_baixa ?? existing.data_baixa,
      req.params.id
    );
    const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
    res.json(updated);
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.status(409).json({ error: 'Server name already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE server
app.delete('/api/servers/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Server not found' });
  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.id);
  res.json({ message: 'Server deleted', id: req.params.id });
});

// GET stats summary
app.get('/api/stats', (req, res) => {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_servers,
      SUM(vcpus) as total_vcpus,
      SUM(memory) as total_memory_gb,
      SUM(disk_total) as total_disk_gb
    FROM servers
  `).get();
  res.json(stats);
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`📦 Database: db/servers.db`);
  console.log(`📡 API: http://localhost:${PORT}/api/servers`);
});
