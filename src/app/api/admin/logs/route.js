/**
 * 管理端 - 系统日志列表 API
 * GET /api/admin/logs
 *
 * 参数：
 *   page: 页码 (默认 1)
 *   pageSize: 每页条数 (默认 50)
 *   level: 过滤级别 ('trace'|'debug'|'info'|'warn'|'error'|'fatal')
 *   errorOnly: 是否仅看报错 ('true'|'false')
 *   traceId: 全链路 ID 筛选
 *   keyword: 关键字全文本模糊检索
 *   startTime / endTime: 时间范围
 */

const fs = require('fs');
const path = require('path');
const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');

const LEVEL_MAP = {
  10: 'trace',
  20: 'debug',
  30: 'info',
  35: 'audit',
  40: 'warn',
  50: 'error',
  60: 'fatal',
};

const NAME_TO_LEVEL = {
  trace: 10,
  debug: 20,
  info: 30,
  audit: 35,
  warn: 40,
  error: 50,
  fatal: 60,
};

async function getHandler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '1', 10);
  const pageSize = Math.min(parseInt(searchParams.get('pageSize') || '50', 10), 200);
  const levelFilter = searchParams.get('level') || '';
  const errorOnly = searchParams.get('errorOnly') === 'true';
  const auditOnly = searchParams.get('auditOnly') === 'true';
  const traceId = (searchParams.get('traceId') || '').trim();
  const keyword = (searchParams.get('keyword') || '').trim().toLowerCase();
  const startTime = searchParams.get('startTime') || '';
  const endTime = searchParams.get('endTime') || '';

  const logsDir = path.join(process.cwd(), 'logs');
  let allEntries = [];
  let totalSizeBytes = 0;
  let fileCount = 0;

  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.startsWith('weldsnap-run.log'))
      .map((f) => {
        const fullPath = path.join(logsDir, f);
        const stat = fs.statSync(fullPath);
        totalSizeBytes += stat.size;
        return { name: f, fullPath, mtime: stat.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime); // 按最新修改时间倒序

    fileCount = files.length;

    for (const fileObj of files) {
      try {
        const content = fs.readFileSync(fileObj.fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            // 规范化级别名称
            entry.levelName = LEVEL_MAP[entry.level] || 'info';
            allEntries.push(entry);
          } catch {
            // 忽略非 JSON 行
          }
        }
      } catch {
        // 读取单个文件异常降级
      }
    }
  }

  // 1. 过滤
  let filtered = allEntries.filter((item) => {
    // 级别与业务审计过滤
    if (errorOnly && item.level < 40) return false;
    if (auditOnly && item.level !== 35) return false;
    if (levelFilter && NAME_TO_LEVEL[levelFilter]) {
      if (item.level !== NAME_TO_LEVEL[levelFilter]) return false;
    }
    // traceId 精确/模糊筛选
    if (traceId && (!item.traceId || !item.traceId.toLowerCase().includes(traceId.toLowerCase()))) {
      return false;
    }
    // 关键字筛选
    if (keyword) {
      const msgStr = (item.msg || '').toLowerCase();
      const urlStr = (item.url || '').toLowerCase();
      const userStr = (item.uploaded_by || '').toLowerCase();
      const pipelineStr = (item.pipeline_no || '').toLowerCase();
      const errStr = item.err ? JSON.stringify(item.err).toLowerCase() : '';
      if (
        !msgStr.includes(keyword) &&
        !urlStr.includes(keyword) &&
        !userStr.includes(keyword) &&
        !pipelineStr.includes(keyword) &&
        !errStr.includes(keyword)
      ) {
        return false;
      }
    }
    // 时间范围筛选
    if (startTime && item.time < startTime) return false;
    if (endTime && item.time > endTime) return false;

    return true;
  });

  // 2. 排序（默认最新时间在前）
  filtered.sort((a, b) => {
    const timeA = a.time || 0;
    const timeB = b.time || 0;
    return timeB > timeA ? 1 : timeB < timeA ? -1 : 0;
  });

  // 3. 分页
  const total = filtered.length;
  const totalPages = Math.ceil(total / pageSize) || 1;
  const start = (page - 1) * pageSize;
  const paginatedLogs = filtered.slice(start, start + pageSize);

  return Response.json({
    success: true,
    page,
    pageSize,
    total,
    totalPages,
    logs: paginatedLogs,
    meta: {
      fileCount,
      totalSizeBytes,
      totalFormattedSize: (totalSizeBytes / 1024 / 1024).toFixed(2) + ' MB',
    },
  });
}

export const GET = withTrace(getHandler);
