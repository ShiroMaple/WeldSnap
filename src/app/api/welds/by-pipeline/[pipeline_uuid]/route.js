/**
 * 根据管线 UUID 获取管线基本信息及焊口列表接口
 * GET /api/welds/by-pipeline/[pipeline_uuid]
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAuth } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function handler(request, { params }) {
  // 普通施工人员或管理员均可访问，需已登录
  requireAuth(request);

  const resolvedParams = await params;
  const pipelineUuid = decodeURIComponent(resolvedParams.pipeline_uuid);

  if (!pipelineUuid) {
    return Response.json({ success: false, error: '缺少管线标识参数' }, { status: 400 });
  }

  const pipeline = db.getPipelineByUuid(pipelineUuid);
  if (!pipeline) {
    return Response.json({ success: false, error: '找不到该管线记录' }, { status: 404 });
  }

  const project = db.db.prepare('SELECT project_name, construction_no, weld_prefix FROM projects WHERE id = ?').get(pipeline.project_id);
  const welds = db.listWelds(pipelineUuid);

  return Response.json({
    success: true,
    pipeline_no: pipeline.pipeline_no,
    project_name: project.project_name,
    construction_no: project.construction_no,
    weld_prefix: project.weld_prefix,
    welds,
  });
}

export const GET = withTrace(handler);
