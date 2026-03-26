const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'db', 'servers.db');

function initDb() {
  const db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      vcpus INTEGER NOT NULL DEFAULT 0,
      memory INTEGER NOT NULL DEFAULT 0,
      disk0 INTEGER NOT NULL DEFAULT 0,
      disk1 INTEGER NOT NULL DEFAULT 0,
      disk_extra INTEGER NOT NULL DEFAULT 0,
      disk_total INTEGER NOT NULL DEFAULT 0,
      servei TEXT,
      tipus TEXT,
      equip TEXT,
      data_baixa TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Seed initial data if empty
  const count = db.prepare('SELECT COUNT(*) as c FROM servers').get();
  if (count.c === 0) {
    const insert = db.prepare(`
      INSERT INTO servers (name, vcpus, memory, disk0, disk1, disk_extra, disk_total, servei, tipus, equip, data_baixa)
      VALUES (@name, @vcpus, @memory, @disk0, @disk1, @disk_extra, @disk_total, @servei, @tipus, @equip, @data_baixa)
    `);

    const seed = db.transaction(() => {
      insert.run({ name: 'azmidi', vcpus: 8, memory: 16, disk0: 32, disk1: 1024, disk_extra: 0, disk_total: 1056, servei: 'postgres+python', tipus: 'Testing', equip: 'Dades', data_baixa: '' });
      insert.run({ name: 'galactus', vcpus: 4, memory: 8, disk0: 32, disk1: 0, disk_extra: 0, disk_total: 32, servei: 'airbyte', tipus: 'Testing', equip: 'Dades', data_baixa: '' });
    });
    seed();
    console.log('✅ Database seeded with initial data');
  }

  return db;
}

module.exports = { initDb };
