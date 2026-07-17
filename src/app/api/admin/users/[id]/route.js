/**
 * 用户管理接口 (修改与删除特定用户)
 * DELETE /api/admin/users/[id] - 删除用户
 * PUT    /api/admin/users/[id] - 修改用户信息
 *
 * 仅系统管理员 (admin) 可访问。
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireSystemAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

/**
 * 删除用户 (系统管理员权限)
 */
async function deleteHandler(request, { params }) {
  requireSystemAdmin(request);

  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return Response.json({ success: false, error: '无效的用户 ID' }, { status: 400 });
  }

  const result = db.deleteUser(numId);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

/**
 * 编辑修改用户 (系统管理员权限)
 */
async function putHandler(request, { params }) {
  requireSystemAdmin(request);

  const { id } = await params;
  const numId = parseInt(id, 10);

  if (isNaN(numId)) {
    return Response.json({ success: false, error: '无效的用户 ID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { username, password, role, display_name } = body;

  if (!username || !username.trim()) {
    return Response.json({ success: false, error: '用户名不能为空' }, { status: 400 });
  }

  if (!['admin', 'project_admin', 'worker'].includes(role)) {
    return Response.json({ success: false, error: '无效的角色' }, { status: 400 });
  }

  const result = db.updateUser(numId, username.trim(), password, role, display_name || username.trim());
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const DELETE = withTrace(deleteHandler);
export const PUT = withTrace(putHandler);
