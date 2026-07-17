/**
 * 权限拦截校验中间件
 *
 * 提供 API 路由级权限守卫。
 * 校验失败时抛出带 status 码的异常，由 withTrace 高阶包装器统一拦截捕获。
 *
 * 角色层级：
 *   admin         — 系统管理员，最高权限
 *   project_admin — 项目管理员，可管理项目/管线/焊口，不可访问成员管理和系统设置，不可强删含照片记录
 *   worker        — 施工人员，仅移动端拍照
 */

const { getSession } = require('../lib/session');
const { setTraceField } = require('../lib/trace');

class AuthError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}

/**
 * 验证当前请求是否已登录
 *
 * @param {Request} request - Next.js Request 对象
 * @returns {Record<string, any>} 解密后的 Session 用户数据
 * @throws {AuthError} 未登录抛出 401
 */
function requireAuth(request) {
  const session = getSession(request.headers);
  if (!session) {
    throw new AuthError('请先登录', 401);
  }

  // 动态将登录用户写入 ALS 上下文，确保所有后续日志均自动附带 uploaded_by
  setTraceField('uploaded_by', session.display_name || session.username);

  return session;
}

/**
 * 验证当前请求是否为管理员（系统管理员或项目管理员）
 *
 * @param {Request} request - Next.js Request 对象
 * @returns {Record<string, any>} 解密后的 Session 用户数据
 * @throws {AuthError} 未登录抛出 401，非管理员抛出 403
 */
function requireAdmin(request) {
  const session = requireAuth(request);
  if (session.role !== 'admin' && session.role !== 'project_admin') {
    throw new AuthError('需要管理员权限', 403);
  }
  return session;
}

/**
 * 验证当前请求是否为系统管理员（仅 admin 角色）
 *
 * 用于成员管理、系统设置、含照片记录的强制删除等敏感操作。
 *
 * @param {Request} request - Next.js Request 对象
 * @returns {Record<string, any>} 解密后的 Session 用户数据
 * @throws {AuthError} 未登录抛出 401，非系统管理员抛出 403
 */
function requireSystemAdmin(request) {
  const session = requireAuth(request);
  if (session.role !== 'admin') {
    throw new AuthError('需要系统管理员权限', 403);
  }
  return session;
}

module.exports = {
  requireAuth,
  requireAdmin,
  requireSystemAdmin,
  AuthError,
};
