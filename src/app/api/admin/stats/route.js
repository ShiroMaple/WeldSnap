/**
 * 管理员获取焊口总体统计数据接口
 * GET /api/admin/stats
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function handler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const projectUuid = searchParams.get('project_uuid');

  if (!projectUuid) {
    return Response.json({ success: false, error: '缺少 project_uuid 参数' }, { status: 400 });
  }

  const stats = db.getStats(projectUuid);
  return Response.json({ success: true, stats });
}

export const GET = withTrace(handler);

