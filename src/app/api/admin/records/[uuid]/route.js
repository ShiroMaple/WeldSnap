/**
 * 单个焊口删除 API 接口 (管理员权限)
 * DELETE /api/admin/records/[uuid] - 删除单个焊口
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function deleteHandler(request, { params }) {
  requireAdmin(request);

  const resolvedParams = await params;
  const uuid = resolvedParams.uuid;

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

export const DELETE = withTrace(deleteHandler);
