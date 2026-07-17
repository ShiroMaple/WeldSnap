export const dynamic = 'force-dynamic';
/**
 * 用户登录接口
 * POST /api/auth/login
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { setSession } = require('../../../../lib/session');
const db = require('../../../../lib/db');
const { logger } = require('../../../../lib/logger');

async function handler(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { username, password } = body;
  if (!username || !password) {
    return Response.json({ success: false, error: '请输入用户名和密码' }, { status: 400 });
  }

  const user = db.verifyUser(username, password);
  if (!user) {
    logger.warn({ msg: 'auth.login_failed', username });
    return Response.json({ success: false, error: '用户名或密码错误' }, { status: 400 });
  }

  logger.info({ msg: 'auth.login_success', username, role: user.role });

  // 更新最后登录时间
  db.updateLastLogin(user.id);

  const headers = new Headers({
    'Content-Type': 'application/json',
  });

  // 写入 Session Cookie
  setSession(headers, user);

  return new Response(
    JSON.stringify({ success: true, user }),
    { status: 200, headers }
  );
}

export const POST = withTrace(handler);
