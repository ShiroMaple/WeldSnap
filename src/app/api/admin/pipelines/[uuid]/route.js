/**
 * 管线编辑/删除 API 接口 (管理员权限)
 * PUT    /api/admin/pipelines/[uuid] - 编辑管线号
 * DELETE /api/admin/pipelines/[uuid] - 删除单个管线及级联焊口
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function putHandler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少管线 UUID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { pipeline_no } = body;
  if (!pipeline_no || !pipeline_no.trim()) {
    return Response.json({ success: false, error: '管线号不能为空' }, { status: 400 });
  }

  const result = db.updatePipeline(uuid, pipeline_no);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

async function deleteHandler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少管线 UUID' }, { status: 400 });
  }

  const result = db.deletePipeline(uuid);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const PUT = withTrace(putHandler);
export const DELETE = withTrace(deleteHandler);
