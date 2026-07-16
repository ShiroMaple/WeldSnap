/**
 * 校验用户登录状态接口
 * GET /api/auth/check
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { getSession } = require('../../../../lib/session');

async function handler(request) {
  const session = getSession(request.headers);

  if (session) {
    return Response.json({ logged_in: true, user: session });
  } else {
    return Response.json({ logged_in: false });
  }
}

export const GET = withTrace(handler);
