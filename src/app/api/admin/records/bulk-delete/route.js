/**
 * 批量删除管线/焊口 API 接口 (管理员权限)
 * POST /api/admin/records/bulk-delete
 *
 * 接收 uuids (数组), type ('pipeline' | 'weld'), 与可选的 force (布尔值)
 * 执行混合状态熔断安全检查：如含有照片记录且 force 为 false，则拦截并返回熔断提示。
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

async function handler(request) {
  const user = requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { uuids, type, force } = body;

  if (!uuids || !Array.isArray(uuids) || uuids.length === 0) {
    return Response.json({ success: false, error: '缺少有效的 uuids 数组' }, { status: 400 });
  }

  if (!['pipeline', 'weld'].includes(type)) {
    return Response.json({ success: false, error: '无效的 type 参数' }, { status: 400 });
  }

  // 校验当前用户是否为系统管理员 (只有 admin 角色是系统管理员)
  const isSystemAdmin = user.role === 'admin';

  // 如果没有强制删除标识，我们视 isSystemAdmin 为 false 以触发安全熔断拦截
  const result = db.bulkDelete(uuids, type, force ? isSystemAdmin : false);

  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const POST = withTrace(handler);
