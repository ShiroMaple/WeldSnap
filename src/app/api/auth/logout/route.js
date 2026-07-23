export const dynamic = 'force-dynamic';
/**
 * 用户退出接口
 * POST /api/auth/logout
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { clearSession } = require('../../../../lib/session');
const { logger } = require('../../../../lib/logger');
const { logAudit } = require('../../../../lib/audit');

async function handler(request) {
  logger.info({ msg: 'auth.logout' });
  logAudit('USER_LOGOUT', '登出了系统');

  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  // 销毁 Session Cookie
  clearSession(headers);

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers }
  );
}

export const POST = withTrace(handler);
