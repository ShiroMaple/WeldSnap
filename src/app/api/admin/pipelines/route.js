export const dynamic = 'force-dynamic';
/**
 * 管线管理 API 接口 (管理员权限)
 * GET  /api/admin/pipelines?project_uuid=... - 获取项目下的管线及进度统计
 * POST /api/admin/pipelines - 在项目下创建管线 (支持自动前缀编号)
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

async function getHandler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const projectUuid = searchParams.get('project_uuid');

  if (!projectUuid) {
    return Response.json({ success: false, error: '缺少 project_uuid 参数' }, { status: 400 });
  }

  const pipelines = db.listPipelines(projectUuid);
  return Response.json({ success: true, pipelines });
}

async function postHandler(request) {
  requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { project_uuid, pipeline_no } = body;

  if (!project_uuid) {
    return Response.json({ success: false, error: '缺少 project_uuid' }, { status: 400 });
  }

  const result = db.createPipeline(project_uuid, pipeline_no);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);
