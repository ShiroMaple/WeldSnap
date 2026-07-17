export const dynamic = 'force-dynamic';
/**
 * 匿名快捷（简易）登录接口
 * POST /api/auth/anonymous
 *
 * 接收 deviceId 与可选的 displayName。
 * 如果该设备尚未注册，则使用生成的用户名 anon_{deviceId} 进行自动注册。
 * 针对重名，系统自动添加 4 位数字序号后缀（如：张师傅_0001）。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { setSession } = require('../../../../lib/session');
const db = require('../../../../lib/db');
const { logger } = require('../../../../lib/logger');
const crypto = require('node:crypto');

async function handler(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: '请求数据格式有误，需 JSON' },
      { status: 400 }
    );
  }

  const { deviceId, displayName: rawName } = body;

  if (!deviceId) {
    return Response.json(
      { success: false, error: '缺少必需参数: deviceId' },
      { status: 400 }
    );
  }

  const username = `anon_${deviceId}`;

  // 1. 查询是否存在该设备绑定的匿名用户
  let user = db.db
    .prepare('SELECT id, username, role, display_name FROM users WHERE username = ?')
    .get(username);

  if (!user) {
    // 2. 首次登录必须提供姓名
    if (!rawName || !rawName.trim()) {
      return Response.json(
        { success: false, error: '首次登录需要输入您的姓名' },
        { status: 400 }
      );
    }

    const cleanName = rawName.trim();

    // 3. 重名检测与 4 位数字序号自增 (如：张师傅#0001)
    const existing = db.db
      .prepare('SELECT display_name FROM users WHERE display_name = ? OR display_name LIKE ?')
      .all(cleanName, `${cleanName}#%`);

    let finalDisplayName = cleanName;
    if (existing.length > 0) {
      const suffix = String(existing.length).padStart(4, '0');
      finalDisplayName = `${cleanName}#${suffix}`;
    }

    // 4. 生成 64 位强密码并自动创建用户
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const createResult = db.createUser(username, randomPassword, 'worker', finalDisplayName);

    if (!createResult.success) {
      logger.error({ msg: 'auth.anonymous_create_failed', username, error: createResult.error });
      return Response.json(
        { success: false, error: '创建简易登录账户失败: ' + createResult.error },
        { status: 500 }
      );
    }

    user = db.db
      .prepare('SELECT id, username, role, display_name FROM users WHERE username = ?')
      .get(username);

    logger.info({ msg: 'auth.anonymous_created', username, displayName: finalDisplayName });
  } else {
    // 5. 如果设备已注册，但请求传递了新姓名，则允许其更新姓名（同样做重名自增处理）
    if (rawName && rawName.trim() && rawName.trim() !== user.display_name) {
      const cleanName = rawName.trim();
      const existing = db.db
        .prepare('SELECT display_name FROM users WHERE display_name = ? OR display_name LIKE ?')
        .all(cleanName, `${cleanName}#%`);

      let finalDisplayName = cleanName;
      if (existing.length > 0) {
        const suffix = String(existing.length).padStart(4, '0');
        finalDisplayName = `${cleanName}#${suffix}`;
      }

      db.db
        .prepare('UPDATE users SET display_name = ? WHERE username = ?')
        .run(finalDisplayName, username);

      user.display_name = finalDisplayName;
      logger.info({ msg: 'auth.anonymous_name_updated', username, displayName: finalDisplayName });
    }

    logger.info({ msg: 'auth.anonymous_login_success', username });
  }

  // 6. 更新最后登录时间并写入 Session
  db.updateLastLogin(user.id);

  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  setSession(headers, user);

  return new Response(
    JSON.stringify({ success: true, user }),
    { status: 200, headers }
  );
}

export const POST = withTrace(handler);
