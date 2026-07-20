/**
 * 管理端 - 系统日志导出 API
 * GET /api/admin/logs/export
 *
 * 参数：
 *   format: 'log' | 'csv' (默认 'log')
 *   level, errorOnly, traceId, keyword, startTime, endTime (与检索接口相同)
 */

const fs = require('fs');
const path = require('path');
const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');

const LEVEL_MAP = {
  10: 'TRACE',
  20: 'DEBUG',
  30: 'INFO',
  35: 'AUDIT',
  40: 'WARN',
  50: 'ERROR',
  60: 'FATAL',
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
  const format = searchParams.get('format') || 'log';
  const levelFilter = searchParams.get('level') || '';
  const errorOnly = searchParams.get('errorOnly') === 'true';
  const auditOnly = searchParams.get('auditOnly') === 'true';
  const traceId = (searchParams.get('traceId') || '').trim();
  const keyword = (searchParams.get('keyword') || '').trim().toLowerCase();
  const startTime = searchParams.get('startTime') || '';
  const endTime = searchParams.get('endTime') || '';

  const logsDir = path.join(process.cwd(), 'logs');
  let allEntries = [];

  if (fs.existsSync(logsDir)) {
    const files = fs.readdirSync(logsDir)
      .filter((f) => f.startsWith('weldsnap-run.log'))
      .map((f) => {
        const fullPath = path.join(logsDir, f);
        return { name: f, fullPath, mtime: fs.statSync(fullPath).mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);

    for (const fileObj of files) {
      try {
        const content = fs.readFileSync(fileObj.fullPath, 'utf8');
        const lines = content.split(/\r?\n/);
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);
            entry.levelName = LEVEL_MAP[entry.level] || 'INFO';
            allEntries.push(entry);
          } catch {
            // 忽略非 JSON 行
          }
        }
      } catch { }
    }
  }

  // 过滤
  let filtered = allEntries.filter((item) => {
    if (errorOnly && item.level < 40) return false;
    if (auditOnly && item.level !== 35) return false;
    if (levelFilter && NAME_TO_LEVEL[levelFilter]) {
      if (item.level !== NAME_TO_LEVEL[levelFilter]) return false;
    }
    if (traceId && (!item.traceId || !item.traceId.toLowerCase().includes(traceId.toLowerCase()))) {
      return false;
    }
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
    if (startTime && item.time < startTime) return false;
    if (endTime && item.time > endTime) return false;

    return true;
  });

  // 倒序排列
  filtered.sort((a, b) => {
    const timeA = a.time || 0;
    const timeB = b.time || 0;
    return timeB > timeA ? 1 : timeB < timeA ? -1 : 0;
  });

  const nowStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

  if (format === 'csv') {
    // 导出 CSV
    const headers = ['时间', '级别', 'TraceID', '操作人', '请求方法', '请求URL', '管线号', '消息内容', '异常明细'];
    const rows = filtered.map((e) => [
      `"${e.time || ''}"`,
      `"${e.levelName || ''}"`,
      `"${e.traceId || ''}"`,
      `"${(e.uploaded_by || '').replace(/"/g, '""')}"`,
      `"${e.method || ''}"`,
      `"${(e.url || '').replace(/"/g, '""')}"`,
      `"${e.pipeline_no || ''}"`,
      `"${(e.msg || '').replace(/"/g, '""')}"`,
      `"${e.err ? JSON.stringify(e.err).replace(/"/g, '""') : ''}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="weldsnap-logs_${nowStr}.csv"`,
      },
    });
  } else {
    // 导出 NDJSON .log
    const logContent = filtered.map((e) => JSON.stringify(e)).join('\n');
    return new Response(logContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="weldsnap-logs_${nowStr}.log"`,
      },
    });
  }
}

export const GET = withTrace(getHandler);
