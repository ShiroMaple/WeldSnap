export const dynamic = 'force-dynamic';
/**
 * 用户管理接口 (列表与新增)
 *
 * GET  /api/admin/users - 获取所有用户列表
 * POST /api/admin/users - 新增用户
 *
 * 仅系统管理员 (admin) 可访问。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireSystemAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');

/**
 * 获取用户列表 (系统管理员权限)
 */
async function getHandler(request) {
  requireSystemAdmin(request);

  // 自动销号规则：清理超过 90 天未登录的简易匿名账户 (username 以 anon_ 开头)
  try {
    db.db.exec(`
      DELETE FROM users 
      WHERE username LIKE 'anon_%' 
        AND (
          (last_login_at IS NOT NULL AND julianday('now','localtime') - julianday(last_login_at) > 90)
          OR
          (last_login_at IS NULL AND julianday('now','localtime') - julianday(created_at) > 90)
        )
    `);
  } catch (err) {
    // 仅记录异常，不阻断正常列表拉取
    db.db.exec('select 1'); // dummy command to check db status, or we can just ignore
  }

  const users = db.listUsers();
  return Response.json({ success: true, users });
}

/**
 * 创建新用户 (系统管理员权限)
 */
const { logAudit } = require('../../../../lib/audit');

const ROLE_CN = { admin: '系统管理员', project_admin: '项目管理员', worker: '施工人员' };

async function postHandler(request) {
  requireSystemAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { username, password, role, display_name } = body;
  if (!username || !password) {
    return Response.json({ success: false, error: '用户名和密码不能为空' }, { status: 400 });
  }

  if (!['admin', 'project_admin', 'worker'].includes(role)) {
    return Response.json({ success: false, error: '无效的角色' }, { status: 400 });
  }

  const result = db.createUser(username, password, role, display_name || username);
  if (result.success) {
    logAudit(
      'CREATE_USER',
      `创建了新用户账号 "${username.trim()}" (姓名: ${display_name || username}, 角色: ${ROLE_CN[role] || role})`,
      { username: username.trim(), role, display_name }
    );
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);
