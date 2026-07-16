/**
 * 权限拦截校验中间件
 *
 * 提供 API 路由级权限守卫。
 * 校验失败时抛出带 status 码的异常，由 withTrace 高阶包装器统一拦截捕获。
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
 * 验证当前请求是否为管理员
 *
 * @param {Request} request - Next.js Request 对象
 * @returns {Record<string, any>} 解密后的 Session 用户数据
 * @throws {AuthError} 未登录抛出 401，非管理员抛出 403
 */
function requireAdmin(request) {
  const session = requireAuth(request);
  if (session.role !== 'admin') {
    throw new AuthError('需要管理员权限', 403);
  }
  return session;
}

module.exports = {
  requireAuth,
  requireAdmin,
  AuthError,
};
