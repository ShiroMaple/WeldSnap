export const dynamic = 'force-dynamic';
/**
 * 项目列表 API 接口 (已登录施工人员/管理员均可访问)
 * GET /api/projects - 获取所有活跃项目及其完成度聚合统计
 */

const { withTrace } = require('../../../middleware/withTrace');
const { requireAuth } = require('../../../middleware/auth');
const db = require('../../../lib/db');

async function getHandler(request) {
  requireAuth(request);
  const projects = db.listProjects();
  return Response.json({ success: true, projects });
}

export const GET = withTrace(getHandler);
