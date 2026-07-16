/**
 * 管理员获取所有管线统计进度接口
 * GET /api/admin/pipelines
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function handler(request) {
  requireAdmin(request);
  const pipelines = db.getAllPipelines();
  return Response.json({ success: true, pipelines });
}

export const GET = withTrace(handler);

