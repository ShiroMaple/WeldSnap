/**
 * SQLite DatabaseSync 封装 (全新项目级拓扑模型重构版)
 *
 * 物理表层级：projects ➔ pipelines ➔ weld_records
 * 使用 Node.js 内置 crypto.randomUUID() 自动生成全局唯一 uuid。
 *
 * 注意：node:sqlite 需 Node.js v22+ 并通过 --experimental-sqlite 启动参数启用。
 */

const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
const crypto = require('node:crypto');
const { logger } = require('./logger');

// ─── 数据库初始化 ─────────────────────────────────────────
const DB_PATH = path.join(process.cwd(), 'data', 'app.db');

let dbInstance = null;

function getDbInstance() {
  if (!dbInstance) {
    const dataDir = path.dirname(DB_PATH);
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const db = new DatabaseSync(DB_PATH);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA busy_timeout = 5000');
    db.exec('PRAGMA foreign_keys = ON');

    logger.info({ msg: 'db.initialized', path: DB_PATH });

    // ─── 表结构初始化 ─────────────────────────────────────────
    let retries = 30;
    while (retries > 0) {
      try {
        // 检查 users 表是否存在以确认全部初始化已落盘
        const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get();
        if (!tableExists) {
          db.exec(`
            CREATE TABLE IF NOT EXISTS projects (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              uuid            TEXT UNIQUE NOT NULL,
              construction_no TEXT UNIQUE NOT NULL,
              project_name    TEXT NOT NULL,
              remark          TEXT,
              status          TEXT NOT NULL DEFAULT '进行中',
              pipeline_prefix TEXT,
              weld_prefix     TEXT,
              created_at      TEXT DEFAULT (datetime('now','localtime'))
            );

            CREATE TABLE IF NOT EXISTS pipelines (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              uuid            TEXT UNIQUE NOT NULL,
              project_id      INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
              pipeline_no     TEXT NOT NULL,
              created_at      TEXT DEFAULT (datetime('now','localtime')),
              UNIQUE(project_id, pipeline_no)
            );

            CREATE TABLE IF NOT EXISTS weld_records (
              id              INTEGER PRIMARY KEY AUTOINCREMENT,
              uuid            TEXT UNIQUE NOT NULL,
              pipeline_id      INTEGER NOT NULL REFERENCES pipelines(id) ON DELETE CASCADE,
              weld_no         TEXT NOT NULL,
              photo_zudui     TEXT,
              photo_dadi      TEXT,
              photo_gaimian   TEXT,
              uploaded_by     TEXT,
              uploaded_at     TEXT,
              create_source   TEXT NOT NULL DEFAULT '管理控制台创建',
              created_at      TEXT DEFAULT (datetime('now','localtime')),
              UNIQUE(pipeline_id, weld_no)
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
        }
        break; // 成功执行，跳出循环
      } catch (err) {
        if (err.message.includes('locked')) {
          retries--;
          logger.warn({ msg: 'db.init_locked', retries_remaining: retries });
          // 同步等待 150 毫秒后重试
          const start = Date.now();
          while (Date.now() - start < 150) {}
        } else {
          throw err;
        }
      }
    }
    dbInstance = db;
  }
  return dbInstance;
}

// ─── 使用 Proxy 实现数据库连接懒加载，防止 Next.js 编译期加载模块时并发抢占文件锁 ───
const db = new Proxy({}, {
  get(target, prop) {
    const instance = getDbInstance();
    const value = instance[prop];
    if (typeof value === 'function') {
      return value.bind(instance);
    }
    return value;
  }
});

// ─── 用户认证相关 ─────────────────────────────────────────
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
  try {
    const hash = bcrypt.hashSync(password, 10);
    db.prepare(
      'INSERT INTO users (username, password_hash, role, display_name) VALUES (?, ?, ?, ?)'
    ).run(username, hash, role, displayName || username);
    logger.info({ msg: 'db.user_created', username });
    return { success: true };
  } catch (e) {
    logger.error({ msg: 'db.user_create_failed', username, error: e.message });
    return { success: false, error: '用户名已存在' };
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

// ─── 项目 (Projects) 业务操作 ─────────────────────────────
function listProjects() {
  return db.prepare(`
    SELECT 
      p.*,
      (SELECT COUNT(*) FROM pipelines WHERE project_id = p.id) as pipeline_count,
      (
        SELECT COUNT(*) 
        FROM weld_records w 
        JOIN pipelines pl ON w.pipeline_id = pl.id 
        WHERE pl.project_id = p.id
      ) as weld_count,
      (
        SELECT CASE 
          WHEN COUNT(w.id) = 0 THEN 0
          ELSE ROUND(
            (
              SUM(CASE WHEN w.photo_zudui IS NOT NULL AND w.photo_zudui NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END) +
              SUM(CASE WHEN w.photo_dadi IS NOT NULL AND w.photo_dadi NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END) +
              SUM(CASE WHEN w.photo_gaimian IS NOT NULL AND w.photo_gaimian NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END)
            ) * 100.0 / (COUNT(w.id) * 3.0), 
            0
          )
        END
        FROM weld_records w
        JOIN pipelines pl ON w.pipeline_id = pl.id
        WHERE pl.project_id = p.id
      ) as quality_progress
    FROM projects p
    ORDER BY p.created_at DESC
  `).all();
}

function getProjectByUuid(uuid) {
  return db.prepare('SELECT * FROM projects WHERE uuid = ?').get(uuid) || null;
}

function createProject(constructionNo, projectName, remark, pipelinePrefix, weldPrefix) {
  try {
    const uuid = crypto.randomUUID();
    db.prepare(`
      INSERT INTO projects (uuid, construction_no, project_name, remark, pipeline_prefix, weld_prefix)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(uuid, constructionNo.trim(), projectName.trim(), remark || '', pipelinePrefix || null, weldPrefix || null);
    
    logger.info({ msg: 'db.project_created', uuid, constructionNo });
    return { success: true, uuid };
  } catch (e) {
    logger.error({ msg: 'db.project_create_failed', constructionNo, error: e.message });
    return { success: false, error: '施工号已存在，无法重复创建' };
  }
}

function updateProject(uuid, constructionNo, projectName, remark, pipelinePrefix, weldPrefix, status) {
  try {
    db.prepare(`
      UPDATE projects 
      SET construction_no = ?, project_name = ?, remark = ?, pipeline_prefix = ?, weld_prefix = ?, status = ?
      WHERE uuid = ?
    `).run(constructionNo.trim(), projectName.trim(), remark || '', pipelinePrefix || null, weldPrefix || null, status, uuid);
    return { success: true };
  } catch (e) {
    return { success: false, error: '更新失败: 施工号可能已被其他项目占用' };
  }
}

function deleteProject(uuid) {
  try {
    db.prepare('DELETE FROM projects WHERE uuid = ?').run(uuid);
    logger.info({ msg: 'db.project_deleted', uuid });
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── 管线 (Pipelines) 业务操作 ────────────────────────────
function listPipelines(projectUuid) {
  return db.prepare(`
    SELECT
      pl.*,
      (SELECT COUNT(*) FROM weld_records WHERE pipeline_id = pl.id) as weld_count,
      (
        SELECT COUNT(*)
        FROM weld_records
        WHERE pipeline_id = pl.id
          AND photo_zudui IS NOT NULL AND photo_zudui NOT LIKE 'REJECTED:%'
          AND photo_dadi IS NOT NULL AND photo_dadi NOT LIKE 'REJECTED:%'
          AND photo_gaimian IS NOT NULL AND photo_gaimian NOT LIKE 'REJECTED:%'
      ) as completed
    FROM pipelines pl
    JOIN projects pr ON pl.project_id = pr.id
    WHERE pr.uuid = ?
    ORDER BY pl.pipeline_no ASC
  `).all(projectUuid);
}

/**
 * 导出项目数据：该项目下所有管线和焊口，按管线号+焊口号排序。
 * 返回 [{ pipeline_no, weld_no, create_source }, ...]
 */
function exportProjectData(projectUuid) {
  return db.prepare(`
    SELECT pl.pipeline_no, w.weld_no, w.create_source
    FROM weld_records w
    JOIN pipelines pl ON w.pipeline_id = pl.id
    JOIN projects pr ON pl.project_id = pr.id
    WHERE pr.uuid = ?
    ORDER BY pl.pipeline_no ASC, w.weld_no ASC
  `).all(projectUuid);
}

function getPipelineByUuid(uuid) {
  return db.prepare('SELECT * FROM pipelines WHERE uuid = ?').get(uuid) || null;
}

function createPipeline(projectUuid, pipelineNo) {
  const project = getProjectByUuid(projectUuid);
  if (!project) {
    return { success: false, error: '关联项目不存在' };
  }

  let finalPipelineNo = pipelineNo ? pipelineNo.trim() : '';

  // 如果设定了管线号前缀，自动编号（如 PL-001）
  if (project.pipeline_prefix) {
    const prefix = project.pipeline_prefix;
    const rows = db.prepare('SELECT pipeline_no FROM pipelines WHERE project_id = ? AND pipeline_no LIKE ?').all(project.id, `${prefix}-%`);
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}-(\\d+)$`);
    for (const r of rows) {
      const m = r.pipeline_no.match(regex);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    finalPipelineNo = `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
  }

  if (!finalPipelineNo) {
    return { success: false, error: '管线号不能为空' };
  }

  try {
    const uuid = crypto.randomUUID();
    db.prepare('INSERT INTO pipelines (uuid, project_id, pipeline_no) VALUES (?, ?, ?)')
      .run(uuid, project.id, finalPipelineNo);
    logger.info({ msg: 'db.pipeline_created', uuid, pipelineNo: finalPipelineNo });
    return { success: true, uuid, pipeline_no: finalPipelineNo };
  } catch (e) {
    return { success: false, error: `管线号 "${finalPipelineNo}" 在当前项目中已存在，请勿重复创建` };
  }
}

function updatePipeline(uuid, pipelineNo) {
  const pipeline = getPipelineByUuid(uuid);
  if (!pipeline) {
    return { success: false, error: '管线不存在' };
  }
  const no = String(pipelineNo).trim();
  if (!no) {
    return { success: false, error: '管线号不能为空' };
  }
  if (no === pipeline.pipeline_no) {
    return { success: true, pipeline_no: no }; // 无变化
  }
  // 唯一性校验：同项目内不可重名
  const conflict = db.prepare('SELECT id FROM pipelines WHERE project_id = ? AND pipeline_no = ? AND id != ?')
    .get(pipeline.project_id, no, pipeline.id);
  if (conflict) {
    return { success: false, error: `管线号 "${no}" 在当前项目中已存在` };
  }
  db.prepare('UPDATE pipelines SET pipeline_no = ? WHERE uuid = ?').run(no, uuid);
  logger.info({ msg: 'db.pipeline_updated', uuid, pipelineNo: no });
  return { success: true, pipeline_no: no };
}

function deletePipeline(uuid) {
  try {
    db.prepare('DELETE FROM pipelines WHERE uuid = ?').run(uuid);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// ─── 焊口 (Weld Records) 业务操作 ─────────────────────────
function listWelds(pipelineUuid) {
  return db.prepare(`
    SELECT w.*, p.pipeline_no, pr.uuid as project_uuid
    FROM weld_records w
    JOIN pipelines p ON w.pipeline_id = p.id
    JOIN projects pr ON p.project_id = pr.id
    WHERE p.uuid = ?
    ORDER BY w.weld_no ASC
  `).all(pipelineUuid);
}

function getWeldByUuid(uuid) {
  return db.prepare(`
    SELECT w.*, p.pipeline_no, pr.uuid as project_uuid, pr.project_name, pr.construction_no
    FROM weld_records w
    JOIN pipelines p ON w.pipeline_id = p.id
    JOIN projects pr ON p.project_id = pr.id
    WHERE w.uuid = ?
  `).get(uuid) || null;
}

function getWeldByPipelineAndWeldNo(pipelineNo, weldNo) {
  // 注意：因为管线号与焊口号在不同项目内可重名，在去语义化直传时需提供此查询。
  // 我们默认获取最近创建的那条，防止历史项目冲突。
  return db.prepare(`
    SELECT w.*, p.pipeline_no, pr.uuid as project_uuid, pr.project_name, pr.construction_no
    FROM weld_records w
    JOIN pipelines p ON w.pipeline_id = p.id
    JOIN projects pr ON p.project_id = pr.id
    WHERE p.pipeline_no = ? AND w.weld_no = ?
    ORDER BY w.id DESC
  `).get(pipelineNo, weldNo) || null;
}

function createWeld(pipelineUuid, weldNo, createSource = '管理控制台创建') {
  const pipeline = getPipelineByUuid(pipelineUuid);
  if (!pipeline) {
    return { success: false, error: '关联管线不存在' };
  }

  const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(pipeline.project_id);
  let finalWeldNo = weldNo ? weldNo.trim() : '';

  // 如果设定了焊口号前缀，自动编号（如 W-01）
  if (project.weld_prefix) {
    const prefix = project.weld_prefix;
    const rows = db.prepare('SELECT weld_no FROM weld_records WHERE pipeline_id = ? AND weld_no LIKE ?').all(pipeline.id, `${prefix}-%`);
    let maxNum = 0;
    const regex = new RegExp(`^${prefix}-(\\d+)$`);
    for (const r of rows) {
      const m = r.weld_no.match(regex);
      if (m) {
        const num = parseInt(m[1], 10);
        if (num > maxNum) maxNum = num;
      }
    }
    finalWeldNo = `${prefix}-${String(maxNum + 1).padStart(2, '0')}`;
  }

  if (!finalWeldNo) {
    return { success: false, error: '焊口号不能为空' };
  }

  try {
    const uuid = crypto.randomUUID();
    db.prepare('INSERT INTO weld_records (uuid, pipeline_id, weld_no, create_source) VALUES (?, ?, ?, ?)')
      .run(uuid, pipeline.id, finalWeldNo, createSource);
    logger.info({ msg: 'db.weld_created', uuid, weldNo: finalWeldNo });
    return { success: true, uuid, weld_no: finalWeldNo };
  } catch (e) {
    return { success: false, error: `焊口号 "${finalWeldNo}" 在当前管线中已存在` };
  }
}

function updateWeld(uuid, weldNo) {
  const weld = getWeldByUuid(uuid);
  if (!weld) {
    return { success: false, error: '焊口不存在' };
  }
  const no = String(weldNo).trim();
  if (!no) {
    return { success: false, error: '焊口号不能为空' };
  }
  if (no === weld.weld_no) {
    return { success: true, weld_no: no }; // 无变化
  }
  // 唯一性校验：同管线内不可重名
  const conflict = db.prepare('SELECT id FROM weld_records WHERE pipeline_id = ? AND weld_no = ? AND id != ?')
    .get(weld.pipeline_id, no, weld.id);
  if (conflict) {
    return { success: false, error: `焊口号 "${no}" 在当前管线中已存在` };
  }
  db.prepare('UPDATE weld_records SET weld_no = ? WHERE uuid = ?').run(no, uuid);
  logger.info({ msg: 'db.weld_updated', uuid, weldNo: no });
  return { success: true, weld_no: no };
}

function deleteWeld(uuid) {
  try {
    db.prepare('DELETE FROM weld_records WHERE uuid = ?').run(uuid);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

function updatePhotoPath(id, field, fileName, uploadedBy) {
  const allowedFields = ['photo_zudui', 'photo_dadi', 'photo_gaimian'];
  if (!allowedFields.includes(field)) {
    throw new Error('Invalid field: ' + field);
  }
  db.prepare(`
    UPDATE weld_records
    SET ${field} = ?, uploaded_by = ?, uploaded_at = datetime('now','localtime')
    WHERE id = ?
  `).run(fileName, uploadedBy, id);
}

function getStats(projectUuid) {
  const project = getProjectByUuid(projectUuid);
  if (!project) return { total: 0, completed: 0, pending: 0 };

  const total = db.prepare(`
    SELECT COUNT(*) as v 
    FROM weld_records w
    JOIN pipelines p ON w.pipeline_id = p.id
    WHERE p.project_id = ?
  `).get(project.id).v;

  const completed = db.prepare(`
    SELECT (
      SUM(CASE WHEN w.photo_zudui IS NOT NULL AND w.photo_zudui NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END) +
      SUM(CASE WHEN w.photo_dadi IS NOT NULL AND w.photo_dadi NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END) +
      SUM(CASE WHEN w.photo_gaimian IS NOT NULL AND w.photo_gaimian NOT LIKE 'REJECTED:%' THEN 1 ELSE 0 END)
    ) as v
    FROM weld_records w
    JOIN pipelines p ON w.pipeline_id = p.id
    WHERE p.project_id = ?
  `).get(project.id).v || 0;

  const totalProcesses = total * 3;
  const pending = totalProcesses - completed;
  return { total, completed, pending };
}

// ─── 批量删除支持与“熔断检查” ──────────────────────────────
function bulkDelete(uuids, type, isSystemAdmin) {
  // uuids: array of string UUIDs
  // type: 'pipeline' | 'weld'
  
  db.exec('BEGIN');
  try {
    let checkedCount = 0;
    let hasPhotoCount = 0;

    if (type === 'weld') {
      const stmtCheck = db.prepare(`
        SELECT photo_zudui, photo_dadi, photo_gaimian 
        FROM weld_records WHERE uuid = ?
      `);
      for (const uuid of uuids) {
        const r = stmtCheck.get(uuid);
        if (r) {
          checkedCount++;
          if (r.photo_zudui || r.photo_dadi || r.photo_gaimian) {
            hasPhotoCount++;
          }
        }
      }

      if (hasPhotoCount > 0 && !isSystemAdmin) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: `⚠️ 在您勾选的 ${checkedCount} 个条目中，有 ${hasPhotoCount} 个已包含照片记录。为防止误删，本次批量操作已拦截。请取消勾选有图焊口，或联系系统管理员进行强行删除。`
        };
      }

      // 执行删除
      const stmtDel = db.prepare('DELETE FROM weld_records WHERE uuid = ?');
      for (const uuid of uuids) {
        stmtDel.run(uuid);
      }

    } else if (type === 'pipeline') {
      const stmtCheck = db.prepare(`
        SELECT w.photo_zudui, w.photo_dadi, w.photo_gaimian
        FROM weld_records w
        JOIN pipelines p ON w.pipeline_id = p.id
        WHERE p.uuid = ?
      `);

      for (const uuid of uuids) {
        const rows = stmtCheck.all(uuid);
        checkedCount++;
        let pHasPhoto = false;
        for (const r of rows) {
          if (r.photo_zudui || r.photo_dadi || r.photo_gaimian) {
            pHasPhoto = true;
            break;
          }
        }
        if (pHasPhoto) {
          hasPhotoCount++;
        }
      }

      if (hasPhotoCount > 0 && !isSystemAdmin) {
        db.exec('ROLLBACK');
        return {
          success: false,
          error: `⚠️ 在您勾选的 ${checkedCount} 个条目中，有 ${hasPhotoCount} 个管线已包含照片记录。为防止误删，本次批量操作已拦截。请取消勾选有图管线，或联系系统管理员进行强行删除。`
        };
      }

      // 执行删除
      const stmtDel = db.prepare('DELETE FROM pipelines WHERE uuid = ?');
      for (const uuid of uuids) {
        stmtDel.run(uuid);
      }
    }

    db.exec('COMMIT');
    return { success: true };
  } catch (err) {
    db.exec('ROLLBACK');
    return { success: false, error: err.message };
  }
}

// ─── Excel 数据导入 ───────────────────────────────────────
function importWeldRecords(rows, projectUuid) {
  const project = getProjectByUuid(projectUuid);
  if (!project) {
    throw new Error('导入失败，项目不存在');
  }

  let inserted = 0;
  let skipped = 0;

  db.exec('BEGIN');
  try {
    const findPipelineStmt = db.prepare('SELECT id FROM pipelines WHERE project_id = ? AND pipeline_no = ?');
    const insertPipelineStmt = db.prepare('INSERT INTO pipelines (uuid, project_id, pipeline_no) VALUES (?, ?, ?)');

    const findWeldStmt = db.prepare('SELECT id FROM weld_records WHERE pipeline_id = ? AND weld_no = ?');
    const insertWeldStmt = db.prepare('INSERT INTO weld_records (uuid, pipeline_id, weld_no) VALUES (?, ?, ?)');

    for (const r of rows) {
      const pipelineNo = String(r.pipeline_no).trim();
      const weldNo = String(r.weld_no).trim();

      if (!pipelineNo || !weldNo) {
        skipped++;
        continue;
      }

      // 1. 查找或插入管线（合并：重名管线追加焊口）
      let pipelineRow = findPipelineStmt.get(project.id, pipelineNo);
      let pipelineId;

      if (pipelineRow) {
        pipelineId = pipelineRow.id;
      } else {
        const pipelineUuid = crypto.randomUUID();
        const res = insertPipelineStmt.run(pipelineUuid, project.id, pipelineNo);
        pipelineId = res.lastInsertRowid;
      }

      // 2. 查找或插入焊口（跳过：重名焊口不覆盖）
      let weldRow = findWeldStmt.get(pipelineId, weldNo);
      if (weldRow) {
        skipped++;
      } else {
        const weldUuid = crypto.randomUUID();
        insertWeldStmt.run(weldUuid, pipelineId, weldNo);
        inserted++;
      }
    }

    db.exec('COMMIT');
    logger.info({ msg: 'db.import_completed', projectUuid, total: rows.length, inserted, skipped });
    return { total: rows.length, inserted, skipped };
  } catch (e) {
    db.exec('ROLLBACK');
    logger.error({ msg: 'db.import_failed', error: e.message });
    throw e;
  }
}

function searchPipelines(keyword) {
  return db.prepare(`
    SELECT p.uuid as pipeline_uuid, p.pipeline_no, pr.project_name, pr.construction_no
    FROM pipelines p
    JOIN projects pr ON p.project_id = pr.id
    WHERE p.pipeline_no LIKE ?
    ORDER BY p.pipeline_no
    LIMIT 50
  `).all('%' + keyword + '%');
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
  
  // Projects
  listProjects,
  getProjectByUuid,
  createProject,
  updateProject,
  deleteProject,

  // Pipelines
  listPipelines,
  getPipelineByUuid,
  createPipeline,
  updatePipeline,
  deletePipeline,
  searchPipelines,

  // Welds
  listWelds,
  getWeldByUuid,
  getWeldByPipelineAndWeldNo,
  createWeld,
  updateWeld,
  deleteWeld,
  updatePhotoPath,
  getStats,
  bulkDelete,
  importWeldRecords,
  exportProjectData,
};
