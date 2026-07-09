const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'app.db');

// 确保data目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL');

// 初始化表结构
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
    created_at      TEXT DEFAULT (datetime('now','localtime'))
  );
`);

// 创建默认管理员
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
    .run('admin', hash, 'admin', '系统管理员');
  console.log('[DB] 默认管理员已创建: admin / admin123');
}

// ---------- 认证 ----------
function verifyUser(username, password) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row) return null;
  if (!bcrypt.compareSync(password, row.password_hash)) return null;
  return { id: row.id, username: row.username, role: row.role, display_name: row.display_name };
}

function getUserById(id) {
  const row = db.prepare('SELECT id, username, role, display_name FROM users WHERE id = ?').get(id);
  return row || null;
}

function listUsers() {
  return db.prepare('SELECT id, username, role, display_name, created_at FROM users ORDER BY id').all();
}

function createUser(username, password, role, displayName) {
  const hash = bcrypt.hashSync(password, 10);
  try {
    db.prepare('INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)')
      .run(username, hash, role, displayName);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function deleteUser(id) {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(id);
  if (user && user.role === 'admin') {
    const adminCount = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE role = 'admin'").get();
    if (adminCount.cnt <= 1) return { success: false, error: '不能删除最后一个管理员' };
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  return { success: true };
}

// ---------- 焊口记录 ----------
function importWeldRecords(rows) {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO weld_records (seq_no, project_name, construction_no, project_no, pipeline_no, weld_no)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  let inserted = 0, skipped = 0;
  const tx = db.exec('BEGIN');
  try {
    for (const r of rows) {
      const result = stmt.run(r.seq_no || '', r.project_name || '', r.construction_no || '',
                               r.project_no || '', r.pipeline_no || '', r.weld_no || '');
      if (result.changes > 0) inserted++; else skipped++;
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return { total: rows.length, inserted, skipped };
}

function getWeldByPipelineAndWeldNo(pipelineNo, weldNo) {
  return db.prepare('SELECT * FROM weld_records WHERE pipeline_no = ? AND weld_no = ?')
    .get(pipelineNo, weldNo);
}

function getWeldsByPipelineNo(pipelineNo) {
  return db.prepare('SELECT * FROM weld_records WHERE pipeline_no = ? ORDER BY weld_no')
    .all(pipelineNo);
}

function searchPipelines(keyword) {
  return db.prepare(`
    SELECT DISTINCT pipeline_no, project_name, construction_no, project_no
    FROM weld_records
    WHERE pipeline_no LIKE ?
    ORDER BY pipeline_no
    LIMIT 50
  `).all('%' + keyword + '%');
}

function getAllPipelines() {
  return db.prepare(`
    SELECT pipeline_no, project_name, construction_no, project_no,
           COUNT(*) as weld_count,
           SUM(CASE WHEN photo_zudui IS NOT NULL AND photo_dadi IS NOT NULL AND photo_gaimian IS NOT NULL THEN 1 ELSE 0 END) as completed
    FROM weld_records
    GROUP BY pipeline_no
    ORDER BY pipeline_no
  `).all();
}

function getAllRecords(filters) {
  let sql = 'SELECT * FROM weld_records WHERE 1=1';
  const params = [];
  if (filters.pipeline_no) { sql += ' AND pipeline_no LIKE ?'; params.push('%' + filters.pipeline_no + '%'); }
  if (filters.weld_no) { sql += ' AND weld_no LIKE ?'; params.push('%' + filters.weld_no + '%'); }
  if (filters.status === 'completed') { sql += ' AND photo_zudui IS NOT NULL AND photo_dadi IS NOT NULL AND photo_gaimian IS NOT NULL'; }
  if (filters.status === 'pending') { sql += ' AND (photo_zudui IS NULL OR photo_dadi IS NULL OR photo_gaimian IS NULL)'; }
  sql += ' ORDER BY pipeline_no, weld_no';
  return db.prepare(sql).all(...params);
}

function updatePhotoPath(id, field, fileName, uploadedBy) {
  const allowedFields = ['photo_zudui', 'photo_dadi', 'photo_gaimian'];
  if (!allowedFields.includes(field)) throw new Error('Invalid field: ' + field);
  db.prepare(`UPDATE weld_records SET ${field} = ?, uploaded_by = ?, uploaded_at = datetime('now','localtime') WHERE id = ?`)
    .run(fileName, uploadedBy, id);
}

function getStats() {
  const total = db.prepare('SELECT COUNT(*) as v FROM weld_records').get().v;
  const completed = db.prepare("SELECT COUNT(*) as v FROM weld_records WHERE photo_zudui IS NOT NULL AND photo_dadi IS NOT NULL AND photo_gaimian IS NOT NULL").get().v;
  const pending = total - completed;
  return { total, completed, pending };
}

module.exports = {
  db,
  verifyUser,
  getUserById,
  listUsers,
  createUser,
  deleteUser,
  importWeldRecords,
  getWeldByPipelineAndWeldNo,
  getWeldsByPipelineNo,
  searchPipelines,
  getAllPipelines,
  getAllRecords,
  updatePhotoPath,
  getStats,
};
