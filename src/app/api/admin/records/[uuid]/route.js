export const dynamic = 'force-dynamic';
/**
 * 焊口编辑/删除 API 接口 (管理员权限)
 * PUT    /api/admin/records/[uuid] - 编辑焊口号
 * DELETE /api/admin/records/[uuid] - 删除单个焊口
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function putHandler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少焊口 UUID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { weld_no } = body;
  if (!weld_no || !weld_no.trim()) {
    return Response.json({ success: false, error: '焊口号不能为空' }, { status: 400 });
  }

  const result = db.updateWeld(uuid, weld_no);
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
    return Response.json({ success: false, error: '缺少焊口 UUID' }, { status: 400 });
  }

  const result = db.deleteWeld(uuid);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const PUT = withTrace(putHandler);
export const DELETE = withTrace(deleteHandler);
