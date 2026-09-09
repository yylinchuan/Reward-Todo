const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

function openDatabase(databaseFile) {
  if (databaseFile !== ':memory:') fs.mkdirSync(path.dirname(databaseFile), { recursive: true });
  const db = new DatabaseSync(databaseFile);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS checklist_items (
      id TEXT PRIMARY KEY,
      body TEXT NOT NULL,
      is_fixed INTEGER NOT NULL DEFAULT 0 CHECK (is_fixed IN (0, 1)),
      done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
      done_at INTEGER,
      position INTEGER NOT NULL DEFAULT 0,
      points INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0),
      created_by TEXT NOT NULL CHECK (created_by IN ('user', 'assistant')),
      created_via TEXT NOT NULL,
      trigger_at INTEGER,
      notified INTEGER NOT NULL DEFAULT 0 CHECK (notified IN (0, 1)),
      created_local_date TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_checklist_items_active
      ON checklist_items (archived_at, is_fixed, position, created_at);
    CREATE INDEX IF NOT EXISTS idx_checklist_items_due
      ON checklist_items (notified, done, trigger_at) WHERE archived_at IS NULL;

    CREATE TABLE IF NOT EXISTS checklist_checkins (
      item_id TEXT NOT NULL REFERENCES checklist_items(id),
      local_date TEXT NOT NULL,
      is_completed INTEGER NOT NULL CHECK (is_completed IN (0, 1)),
      completed_at INTEGER,
      completed_by TEXT CHECK (completed_by IN ('user', 'assistant')),
      recorded_by TEXT NOT NULL CHECK (recorded_by IN ('user', 'assistant')),
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (item_id, local_date)
    );
    CREATE INDEX IF NOT EXISTS idx_checklist_checkins_month
      ON checklist_checkins (item_id, local_date, is_completed);

    CREATE TABLE IF NOT EXISTS reminder_outbox (
      id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL REFERENCES checklist_items(id),
      body TEXT NOT NULL,
      trigger_at INTEGER NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'expired')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      delivered_at INTEGER,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_reminder_outbox_status ON reminder_outbox (status, claimed_at);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS todo_completion_history (
      item_id TEXT NOT NULL REFERENCES checklist_items(id),
      local_date TEXT NOT NULL,
      body_snapshot TEXT NOT NULL,
      is_fixed INTEGER NOT NULL CHECK (is_fixed IN (0, 1)),
      points_snapshot INTEGER NOT NULL DEFAULT 0 CHECK (points_snapshot >= 0),
      completed_at INTEGER NOT NULL,
      completed_by TEXT NOT NULL CHECK (completed_by IN ('user', 'assistant')),
      revoked_at INTEGER,
      PRIMARY KEY (item_id, local_date)
    );
    CREATE INDEX IF NOT EXISTS idx_todo_completion_history_date
      ON todo_completion_history (local_date, revoked_at);

    CREATE TABLE IF NOT EXISTS todo_point_ledger (
      id TEXT PRIMARY KEY,
      local_date TEXT NOT NULL,
      item_id TEXT REFERENCES checklist_items(id),
      reward_id TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('task_award', 'task_reversal', 'reward_redeem', 'adjustment')),
      amount INTEGER NOT NULL,
      note TEXT NOT NULL,
      actor TEXT NOT NULL CHECK (actor IN ('user', 'assistant', 'system')),
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_todo_point_ledger_date
      ON todo_point_ledger (local_date, created_at);

    CREATE TABLE IF NOT EXISTS todo_rewards (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      cost INTEGER NOT NULL CHECK (cost >= 0),
      created_by TEXT NOT NULL CHECK (created_by IN ('user', 'assistant')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      obtained_at INTEGER,
      archived_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_todo_rewards_active
      ON todo_rewards (archived_at, obtained_at, created_at);

    CREATE TABLE IF NOT EXISTS daily_closeout_outbox (
      id TEXT PRIMARY KEY,
      local_date TEXT NOT NULL UNIQUE,
      scheduled_at INTEGER NOT NULL,
      snapshot_json TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('pending', 'delivered', 'failed', 'expired')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      claimed_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      delivered_at INTEGER,
      last_error TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_daily_closeout_status
      ON daily_closeout_outbox (status, local_date);
  `);
  ensureColumn(db, 'checklist_items', 'points', 'INTEGER NOT NULL DEFAULT 0 CHECK (points >= 0)');
}

function ensureColumn(db, table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

module.exports = { openDatabase };
