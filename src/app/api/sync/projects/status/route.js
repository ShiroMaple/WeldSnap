export const dynamic = 'force-dynamic';
/**
 * 致远 OA DEE / 外部 API 更新项目完工状态接口
 * POST /api/sync/projects/status
 * PUT  /api/sync/projects/status
 *
 * 以【施工号】为唯一键值更新项目的完工状态（completion_status）。
 * 支持单条 JSON 对象或 JSON 数组。
 * 支持中文键（施工号、项目完工状态/完工状态/状态）与英文键（construction_no, completion_status/status）。
 *
 * 鉴权：Header 携带 X-API-Key: weldsnap-dee-secret-key
 * 或 Query 参数 ?token=weldsnap-dee-secret-key
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const db = require('../../../../../lib/db');
const { logger } = require('../../../../../lib/logger');
const { logAudit } = require('../../../../../lib/audit');

const DEFAULT_SECRET_TOKEN = process.env.SYNC_API_KEY || 'weldsnap-dee-secret-key';

async function handler(request) {
  // 1. 验证 Token / API Key
  const authHeader = request.headers.get('x-api-key') || request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token') || '';

  const providedKey = authHeader.replace(/^Bearer\s+/i, '').trim() || queryToken.trim();

  if (providedKey !== DEFAULT_SECRET_TOKEN) {
    logger.warn({ msg: 'sync_status.unauthorized', providedKey });
    return Response.json({ success: false, error: '鉴权失败，无效的 API Key / Token' }, { status: 401 });
  }

  // 2. 解析 JSON Body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return Response.json({ success: false, error: '请求 Body 格式错误，必须为合法 JSON 对象或 JSON 数组' }, { status: 400 });
  }

  const rawList = Array.isArray(body) ? body : [body];

  if (rawList.length === 0) {
    return Response.json({ success: false, error: '接收到的更新数据为空' }, { status: 400 });
  }

  // 3. 执行更新
  try {
    const result = db.updateProjectsStatus(rawList);
    logger.info({ msg: 'sync_status.projects_success', ...result });

    // 记录业务审计日志 (Audit Log)
    if (Array.isArray(result.updatedProjects)) {
      result.updatedProjects.forEach((p) => {
        logAudit(
          'UPDATE_PROJECT_STATUS_API',
          `通过 API 接口将项目 "${p.project_name}" (施工号: ${p.construction_no}) 的完工状态由 "${p.old_status}" 更新为 "${p.completion_status}"`,
          {
            source: 'DEE_REST_SYNC',
            uuid: p.uuid,
            construction_no: p.construction_no,
            old_status: p.old_status,
            completion_status: p.completion_status,
          }
        );
      });
    }

    return Response.json({
      success: true,
      message: `项目完工状态更新处理完成。解析 ${result.total} 条，成功更新 ${result.updated} 条，未找到 ${result.notFound} 条。`,
      ...result,
    });
  } catch (err) {
    logger.error({ msg: 'sync_status.projects_failed', error: err.message });
    return Response.json({ success: false, error: '系统内部错误: ' + err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
export const PUT = withTrace(handler);
