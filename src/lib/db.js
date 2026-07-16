/**
 * SQLite DatabaseSync 封装
 *
 * 沿用内置 node:sqlite 的 DatabaseSync 模块，保持与 V1.0 一致的表结构 Schema。
 * 新增 Pino 日志集成，关键数据库操作均附带结构化日志。
 *
 * 注意：node:sqlite 需 Node.js v22+ 并通过 --experimental-sqlite 启动参数启用。
 */

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const { logger } = require('./logger');

// ─── 数据库初始化 ─────────────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

logger.info({ msg: 'db.initialized', path: DB_PATH });

// ─── 表结构初始化 ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS weld_records (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    seq_no          TEXT,
    project_name    TEXT,
    construction_no TEXT,
    project_no      TEXT,
    pipeline_no     TEXT,
    weld_no         TEXT,
    photo_zudui     TEXT,
    photo_dadi      TEXT,
    photo_gaimian   TEXT,
    uploaded_by     TEXT,
    uploaded_at     TEXT,
    UNIQUE(pipeline_no, weld_no)
  );

  CREATE TABLE IF NOT EXISTS users (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    username        TEXT UNIQUE NOT NULL,
    password_hash   TEXT NOT NULL,
    role            TEXT NOT NULL DEFAULT 'worker',
    display_name    TEXT,
    created_at      TEXT DEFAULT (datetime('now','localtime')),
    last_login_at   TEXT
  );
`);

try {
  db.exec('ALTER TABLE users ADD COLUMN last_login_at TEXT');
} catch (e) {
  // Ignore if column already exists
}

// ─── 创建默认管理员 ──────────────────────────────────────
const adminExists = db
  .prepare('SELECT id FROM users WHERE username = ?')
  .get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
  ).run('admin', hash, 'admin', '系统管理员');
  logger.info({ msg: 'db.admin_created', username: 'admin' });
}

// ─── 认证 ────────────────────────────────────────────────
function verifyUser(username, password) {
  const row = db
    .prepare('SELECT * FROM users WHERE username = ?')
    .get(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    display_name: row.display_name,
  };
}

function getUserById(id) {
  const row = db
    .prepare('SELECT id, username, role, display_name FROM users WHERE id = ?')
    .get(id);
  return row || null;
}

function listUsers() {
  return db
    .prepare(
      'SELECT id, username, role, display_name, created_at, last_login_at FROM users ORDER BY id'
    )
    .all();
}

function createUser(username, password, role, displayName) {
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, displayName);
    logger.info({ msg: 'db.user_created', username, role });
    return { success: true };
  } catch (e) {
    logger.error({ msg: 'db.user_create_failed', username, error: e.message });
    return { success: false, error: e.message };
  }
}

function deleteUser(id) {
  const user = db
    .prepare('SELECT role FROM users WHERE id = ?')
    .get(id);
  if (user && user.role === 'admin') {
    const adminCount = db
      .prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'")
      .get();
    if (adminCount.cnt <= 1) {
      return { success: false, error: '不能删除最后一个管理员' };
    }
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  logger.info({ msg: 'db.user_deleted', userId: id });
  return { success: true };
}

// ─── 焊口记录 ────────────────────────────────────────────
function importWeldRecords(rows) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO weld_records
      (seq_no, project_name, construction_no, project_no, pipeline_no, weld_no)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  let inserted = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    for (const r of rows) {
      const result = stmt.run(
        r.seq_no || '',
        r.project_name || '',
        r.construction_no || '',
        r.project_no || '',
        r.pipeline_no || '',
        r.weld_no || ''
      );
      if (result.changes > 0) inserted++;
      else skipped++;
    }
    db.exec('COMMIT');
    logger.info({
      msg: 'db.import_completed',
      total: rows.length,
      inserted,
      skipped,
    });
  } catch (e) {
    db.exec('ROLLBACK');
    logger.error({ msg: 'db.import_failed', error: e.message });
    throw e;
  }

  return { total: rows.length, inserted, skipped };
}

function getWeldByPipelineAndWeldNo(pipelineNo, weldNo) {
  return db
    .prepare(
      'SELECT * FROM weld_records WHERE pipeline_no = ? AND weld_no = ?'
    )
    .get(pipelineNo, weldNo);
}

function getWeldsByPipelineNo(pipelineNo) {
  return db
    .prepare(
      'SELECT * FROM weld_records WHERE pipeline_no = ? ORDER BY weld_no'
    )
    .all(pipelineNo);
}

function searchPipelines(keyword) {
  return db
    .prepare(
      `SELECT DISTINCT pipeline_no, project_name, construction_no, project_no
       FROM weld_records
       WHERE pipeline_no LIKE ?
       ORDER BY pipeline_no
       LIMIT 50`
    )
    .all('%' + keyword + '%');
}

function getAllPipelines() {
  return db
    .prepare(
      `SELECT pipeline_no, project_name, construction_no, project_no,
              COUNT(*) as weld_count,
              SUM(CASE WHEN photo_zudui IS NOT NULL
                        AND photo_dadi IS NOT NULL
                        AND photo_gaimian IS NOT NULL
                   THEN 1 ELSE 0 END) as completed
       FROM weld_records
       GROUP BY pipeline_no
       ORDER BY pipeline_no`
    )
    .all();
}

function getAllRecords(filters) {
  let sql = 'SELECT * FROM weld_records WHERE 1=1';
  const params = [];

  if (filters.pipeline_no) {
    sql += ' AND pipeline_no LIKE ?';
    params.push('%' + filters.pipeline_no + '%');
  }
  if (filters.weld_no) {
    sql += ' AND weld_no LIKE ?';
    params.push('%' + filters.weld_no + '%');
  }
  if (filters.status === 'completed') {
    sql +=
      ' AND photo_zudui IS NOT NULL AND photo_dadi IS NOT NULL AND photo_gaimian IS NOT NULL';
  }
  if (filters.status === 'pending') {
    sql +=
      ' AND (photo_zudui IS NULL OR photo_dadi IS NULL OR photo_gaimian IS NULL)';
  }

  sql += ' ORDER BY pipeline_no, weld_no';
  return db.prepare(sql).all(...params);
}

function updatePhotoPath(id, field, fileName, uploadedBy) {
  const allowedFields = ['photo_zudui', 'photo_dadi', 'photo_gaimian'];
  if (!allowedFields.includes(field)) {
    throw new Error('Invalid field: ' + field);
  }
  db.prepare(
    `UPDATE weld_records
     SET ${field} = ?, uploaded_by = ?, uploaded_at = datetime('now','localtime')
     WHERE id = ?`
  ).run(fileName, uploadedBy, id);
}

function getStats() {
  const total = db
    .prepare('SELECT COUNT(*) as v FROM weld_records')
    .get().v;
  const completed = db
    .prepare(
      "SELECT COUNT(*) as v FROM weld_records WHERE photo_zudui IS NOT NULL AND photo_dadi IS NOT NULL AND photo_gaimian IS NOT NULL"
    )
    .get().v;
  const pending = total - completed;
  return { total, completed, pending };
}

function updateLastLogin(id) {
  db.prepare("UPDATE users SET last_login_at = datetime('now','localtime') WHERE id = ?").run(id);
}

function updateUser(id, username, password, role, displayName) {
  try {
    const existing = db.prepare('SELECT username FROM users WHERE id = ?').get(id);
    if (!existing) {
      return { success: false, error: '用户不存在' };
    }

    if (username !== existing.username && existing.username.startsWith('anon_')) {
      return { success: false, error: '不能修改简易账户的唯一用户名' };
    }

    let sql = 'UPDATE users SET role = ?, display_name = ?';
    const params = [role, displayName];

    if (username !== existing.username && !existing.username.startsWith('anon_')) {
      sql += ', username = ?';
      params.push(username);
    }

    if (password && password.trim()) {
      const hash = bcrypt.hashSync(password, 10);
      sql += ', password_hash = ?';
      params.push(hash);
    }

    sql += ' WHERE id = ?';
    params.push(id);

    db.prepare(sql).run(...params);
    logger.info({ msg: 'db.user_updated', userId: id, username });
    return { success: true };
  } catch (e) {
    logger.error({ msg: 'db.user_update_failed', userId: id, error: e.message });
    return { success: false, error: e.message };
  }
}

// ─── 导出 ────────────────────────────────────────────────
module.exports = {
  db,
  verifyUser,
  getUserById,
  listUsers,
  createUser,
  deleteUser,
  updateUser,
  updateLastLogin,
  importWeldRecords,
  getWeldByPipelineAndWeldNo,
  getWeldsByPipelineNo,
  searchPipelines,
  getAllPipelines,
  getAllRecords,
  updatePhotoPath,
  getStats,
};
