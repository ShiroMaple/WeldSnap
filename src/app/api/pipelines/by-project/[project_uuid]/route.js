export const dynamic = 'force-dynamic';
/**
 * 根据项目 UUID 获取其所有管线列表接口
 * GET /api/pipelines/by-project/[project_uuid]
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAuth } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function handler(request, { params }) {
  requireAuth(request);

  const resolvedParams = await params;
  const projectUuid = decodeURIComponent(resolvedParams.project_uuid);

  if (!projectUuid) {
    return Response.json({ success: false, error: '缺少项目标识参数' }, { status: 400 });
  }

  const project = db.getProjectByUuid(projectUuid);
  if (!project) {
    return Response.json({ success: false, error: '找不到该项目记录' }, { status: 404 });
  }

  const pipelines = db.listPipelines(projectUuid);

  return Response.json({
    success: true,
    project: {
      uuid: project.uuid,
      construction_no: project.construction_no,
      project_name: project.project_name,
      pipeline_prefix: project.pipeline_prefix,
      weld_prefix: project.weld_prefix,
    },
    pipelines,
  });
}

export const GET = withTrace(handler);
