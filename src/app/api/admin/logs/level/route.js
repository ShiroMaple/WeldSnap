/**
 * 管理端 - 系统日志级别 API
 * GET  /api/admin/logs/level  - 查询当前日志级别
 * POST /api/admin/logs/level  - 动态设置日志级别并持久化写入数据库
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const { setLogLevel, getLogLevel } = require('../../../../../lib/logger');
const db = require('../../../../../lib/db');

const VALID_LEVELS = ['trace', 'debug', 'info', 'audit', 'warn', 'error', 'fatal'];

async function getHandler(request) {
  requireAdmin(request);
  
  // 确保 logger 级别与 SQLite 保持同步
  const savedLevel = db.getSetting('log_level') || 'info';
  if (getLogLevel() !== savedLevel) {
    setLogLevel(savedLevel);
  }

  return Response.json({
    success: true,
    currentLevel: getLogLevel(),
    validLevels: VALID_LEVELS,
  });
}

async function postHandler(request) {
  requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体格式不正确' }, { status: 400 });
  }

  const { level } = body;
  if (!level || !VALID_LEVELS.includes(level)) {
    return Response.json({ success: false, error: `无效的日志级别: ${level}` }, { status: 400 });
  }

  setLogLevel(level);
  db.setSetting('log_level', level);

  return Response.json({
    success: true,
    currentLevel: getLogLevel(),
    msg: `全局日志级别已成功调整为 [${level}]`,
  });
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);
