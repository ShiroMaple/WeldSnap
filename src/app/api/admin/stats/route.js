/**
 * 管理员获取焊口总体统计数据接口
 * GET /api/admin/stats
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function handler(request) {
  requireAdmin(request);
  const stats = db.getStats();
  return Response.json({ success: true, stats });
}

export const GET = withTrace(handler);

