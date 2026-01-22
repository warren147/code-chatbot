const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomUUID } = require('crypto');
const config = require('../config/env');

const dataDir = path.join(__dirname, '..', config.databaseFile ? path.dirname(config.databaseFile) : 'data');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(__dirname, '..', config.databaseFile);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');

function tableExists(name) {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(name);
  return Boolean(row);
}

function columnExists(table, column) {
  if (!tableExists(table)) return false;
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  return columns.some((col) => col.name === column);
}

db.exec(`
  CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    file_name TEXT NOT NULL,
    upload_date TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    file_id TEXT NOT NULL,
    conversation_id TEXT,
    position INTEGER NOT NULL,
    content TEXT NOT NULL,
    start_line INTEGER NOT NULL,
    end_line INTEGER NOT NULL,
    vector_id TEXT NOT NULL,
    FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    conversation_id TEXT,
    type TEXT NOT NULL,
    content TEXT NOT NULL,
    embedding TEXT NOT NULL,
    confidence REAL NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS conversation_memory (
    conversation_id TEXT PRIMARY KEY,
    memory TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
`);

if (!columnExists('files', 'conversation_id')) {
  db.exec('ALTER TABLE files ADD COLUMN conversation_id TEXT;');
}

if (!columnExists('chunks', 'conversation_id')) {
  db.exec('ALTER TABLE chunks ADD COLUMN conversation_id TEXT;');
}

if (!columnExists('messages', 'conversation_id')) {
  db.exec('ALTER TABLE messages ADD COLUMN conversation_id TEXT;');
}

if (!columnExists('memories', 'conversation_id')) {
  db.exec('ALTER TABLE memories ADD COLUMN conversation_id TEXT;');
}

if (tableExists('sessions')) {
  const insertConversationStmt = db.prepare(`
    INSERT OR IGNORE INTO conversations (id, title, created_at)
    VALUES (?, ?, ?)
  `);
  const sessions = db.prepare('SELECT id, title, created_at FROM sessions').all();
  sessions.forEach((session) => {
    insertConversationStmt.run(session.id, session.title, session.created_at);
  });
}

if (tableExists('conversations')) {
  const defaultMemory = JSON.stringify({
    preferences: { verbosity: 'default', format: 'default', tone: 'default' },
    facts: { user_goals: [], project_context: [] },
    constraints: { do_not: [] },
  });
  const insertMemoryStmt = db.prepare(`
    INSERT OR IGNORE INTO conversation_memory (conversation_id, memory, updated_at)
    VALUES (?, ?, ?)
  `);
  const conversations = db.prepare('SELECT id FROM conversations').all();
  const now = new Date().toISOString();
  conversations.forEach((conversation) => {
    insertMemoryStmt.run(conversation.id, defaultMemory, now);
  });
}

if (tableExists('messages') && columnExists('messages', 'session_id')) {
  db.exec(`
    UPDATE messages
    SET conversation_id = session_id
    WHERE conversation_id IS NULL AND session_id IS NOT NULL
  `);
}

if (tableExists('memories') && columnExists('memories', 'session_id')) {
  db.exec(`
    UPDATE memories
    SET conversation_id = session_id
    WHERE conversation_id IS NULL AND session_id IS NOT NULL
  `);
}

if (tableExists('messages') && columnExists('messages', 'session_id')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
  db.exec(`
    INSERT INTO messages_new (id, conversation_id, role, content, created_at)
    SELECT id, conversation_id, role, content, created_at
    FROM messages;
  `);
  db.exec('DROP TABLE messages;');
  db.exec('ALTER TABLE messages_new RENAME TO messages;');
}

if (tableExists('memories') && columnExists('memories', 'session_id')) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories_new (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at TEXT NOT NULL,
      last_used_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
  `);
  db.exec(`
    INSERT INTO memories_new (
      id,
      conversation_id,
      type,
      content,
      embedding,
      confidence,
      created_at,
      last_used_at,
      is_active
    )
    SELECT
      id,
      conversation_id,
      type,
      content,
      embedding,
      confidence,
      created_at,
      last_used_at,
      is_active
    FROM memories;
  `);
  db.exec('DROP TABLE memories;');
  db.exec('ALTER TABLE memories_new RENAME TO memories;');
}

if (tableExists('files')) {
  const needsMigration = db.prepare(`
    SELECT COUNT(*) AS count
    FROM files
    WHERE conversation_id IS NULL
  `).get();

  if (needsMigration?.count) {
    const migrationId = randomUUID();
    const createdAt = new Date().toISOString();
    db.prepare(`
      INSERT OR IGNORE INTO conversations (id, title, created_at)
      VALUES (?, ?, ?)
    `).run(migrationId, 'Migrated knowledge base', createdAt);

    db.prepare(`
      UPDATE files
      SET conversation_id = ?
      WHERE conversation_id IS NULL
    `).run(migrationId);

    if (tableExists('chunks')) {
      db.prepare(`
        UPDATE chunks
        SET conversation_id = ?
        WHERE conversation_id IS NULL
      `).run(migrationId);
    }
  }
}

if (tableExists('files')) {
  const indexes = db.prepare(`PRAGMA index_list(files)`).all();
  const hasShaUnique = indexes.some((index) => {
    if (!index.unique) return false;
    const cols = db.prepare(`PRAGMA index_info(${index.name})`).all().map((col) => col.name);
    return cols.length === 1 && cols[0] === 'sha256';
  });

  if (hasShaUnique) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS files_new (
        id TEXT PRIMARY KEY,
        conversation_id TEXT,
        file_name TEXT NOT NULL,
        upload_date TEXT NOT NULL,
        sha256 TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        error TEXT
      );
    `);
    db.exec(`
      INSERT INTO files_new (id, conversation_id, file_name, upload_date, sha256, status, error)
      SELECT id, conversation_id, file_name, upload_date, sha256, status, error
      FROM files;
    `);
    db.exec('DROP TABLE files;');
    db.exec('ALTER TABLE files_new RENAME TO files;');
  }
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_files_conversation
  ON files (conversation_id);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON messages (conversation_id, created_at);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chunks_conversation
  ON chunks (conversation_id);
`);

db.exec(`
  CREATE UNIQUE INDEX IF NOT EXISTS idx_memories_conversation_content
  ON memories (conversation_id, content);
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memories_conversation_active
  ON memories (conversation_id, is_active);
`);

module.exports = db;
