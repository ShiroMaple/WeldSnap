export const dynamic = 'force-dynamic';
/**
 * 项目列表与新增 API 接口 (管理员权限)
 * GET  /api/admin/projects - 获取所有项目及聚合统计
 * POST /api/admin/projects - 新增项目
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function getHandler(request) {
  requireAdmin(request);
  const projects = db.listProjects();
  return Response.json({ success: true, projects });
}

async function postHandler(request) {
  requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { construction_no, project_name, remark, pipeline_prefix, weld_prefix } = body;

  if (!construction_no || !construction_no.trim()) {
    return Response.json({ success: false, error: '项目施工号不能为空' }, { status: 400 });
  }
  if (!project_name || !project_name.trim()) {
    return Response.json({ success: false, error: '项目名称不能为空' }, { status: 400 });
  }

  const result = db.createProject(
    construction_no.trim(),
    project_name.trim(),
    remark || '',
    pipeline_prefix || '',
    weld_prefix || ''
  );

  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);
