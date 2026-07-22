export const dynamic = 'force-dynamic';
/**
 * 致远 OA DEE REST 适配器项目同步接口
 * POST /api/sync/projects
 *
 * 支持单条 JSON 对象或 JSON 数组推送。
 * 鉴权说明：在请求 Header 中携带 X-API-Key: weldsnap-dee-secret-key
 * 或在 URL Query 中携带 ?token=weldsnap-dee-secret-key
 */

const { withTrace } = require('../../../../middleware/withTrace');
const db = require('../../../../lib/db');
const { logger } = require('../../../../lib/logger');

const DEFAULT_SECRET_TOKEN = process.env.SYNC_API_KEY || 'weldsnap-dee-secret-key';

async function handler(request) {
  // 1. 验证 Token / API Key
  const authHeader = request.headers.get('x-api-key') || request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token') || '';

  const providedKey = authHeader.replace(/^Bearer\s+/i, '').trim() || queryToken.trim();

  if (providedKey !== DEFAULT_SECRET_TOKEN) {
    logger.warn({ msg: 'sync.unauthorized', providedKey });
    return Response.json({ success: false, error: '鉴权失败，无效的 API Key / Token' }, { status: 401 });
  }

  // 2. 解析 JSON Body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ success: false, error: '请求 Body 格式错误，必须为 JSON 对象或 JSON 数组' }, { status: 400 });
  }

  // 标准化为数组
  const rawList = Array.isArray(body) ? body : [body];

  if (rawList.length === 0) {
    return Response.json({ success: false, error: '接收到的项目数据为空' }, { status: 400 });
  }

  // 严格按约定读取字段
  const records = rawList.map((item) => ({
    construction_no: String(item.construction_no || '').trim(),
    project_name: String(item.project_name || '').trim(),
    owner_unit: String(item.owner_unit || '').trim(),
    construction_unit: String(item.construction_unit || '').trim(),
    completion_status: String(item.completion_status || '').trim() || '进行中',
    remark: String(item.remark || '').trim(),
    pipeline_prefix: String(item.pipeline_prefix || '').trim(),
    weld_prefix: String(item.weld_prefix || '').trim(),
  }));

  // 3. 调用数据库批量插入/去重事务
  try {
    const result = db.importProjects(records);
    logger.info({ msg: 'sync.projects_success', ...result });

    return Response.json({
      success: true,
      message: `同步处理完成。解析 ${result.total} 条，成功写入 ${result.inserted} 条，跳过 ${result.skipped} 条。`,
      ...result,
    });
  } catch (err) {
    logger.error({ msg: 'sync.projects_failed', error: err.message });
    return Response.json({ success: false, error: '系统内部错误: ' + err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
