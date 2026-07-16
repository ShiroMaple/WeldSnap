/**
 * 内置 Crypto AES-256-GCM Cookie 会话管理模块
 *
 * 采用极简、低依赖设计。不引入额外的第三方 session 库，
 * 直接使用 Node.js 的 crypto 模块实现安全的会话数据加密与解密。
 */

const crypto = require('node:crypto');
const { getSessionSecret } = require('./env');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM 推荐 12 字节 IV
const AUTH_TAG_LENGTH = 16; // GCM 认证标签 16 字节
const COOKIE_NAME = 'weld_session';
const MAX_AGE = 12 * 60 * 60; // 12 小时有效时间，与 V1 一致

/**
 * 衍生 32 字节（256 位）安全密钥
 * @returns {Buffer}
 */
function getDerivedKey() {
  const secret = getSessionSecret();
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * 加密 Session 数据
 * @param {Record<string, any>} data - 要加密的数据对象
 * @returns {string} iv:authTag:encryptedData 的 Base64 组合字符串
 */
function encrypt(data) {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  // 拼接成一个传输串：iv(Hex):authTag(Hex):encrypted(Hex)
  const token = `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  return Buffer.from(token).toString('base64');
}

/**
 * 解密 Session 数据
 * @param {string} sessionStr - 客户端传入的 Base64 格式加密字符串
 * @returns {Record<string, any> | null} 解密后的数据对象，失败则返回 null
 */
function decrypt(sessionStr) {
  if (!sessionStr) return null;

  try {
    const raw = Buffer.from(sessionStr, 'base64').toString('utf8');
    const [ivHex, authTagHex, encrypted] = raw.split(':');

    if (!ivHex || !authTagHex || !encrypted) return null;

    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return JSON.parse(decrypted);
  } catch (err) {
    // 解密失败可能是密钥更改、数据损坏或伪造请求，直接返回 null
    return null;
  }
}

/**
 * 从 Cookie 头部解析特定 Cookie
 * @param {string} cookieHeader - request.headers.get('cookie') 中的原始字符串
 * @returns {string | null} 会话 token 值
 */
function parseSessionCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const [key, val] = pair.split('=');
    if (key.trim() === COOKIE_NAME) {
      return decodeURIComponent(val.trim());
    }
  }
  return null;
}

/**
 * 将 Session 写入 Cookie (Set-Cookie 响应头)
 * @param {Headers} headers - Response 响应的 Headers 对象
 * @param {Record<string, any>} sessionData - 要保存的 Session 键值对
 */
function setSession(headers, sessionData) {
  const token = encrypt(sessionData);
  // HttpOnly, SameSite=Lax 保证传输安全性
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; Max-Age=${MAX_AGE}; HttpOnly; SameSite=Lax`
  );
}

/**
 * 销毁 Session (设置过期 Cookie)
 * @param {Headers} headers - Response 响应的 Headers 对象
 */
function clearSession(headers) {
  headers.append(
    'Set-Cookie',
    `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`
  );
}

/**
 * 从 HTTP 请求头中提取并解密 Session 数据
 * @param {Headers} headers - Request 请求的 Headers 对象
 * @returns {Record<string, any> | null}
 */
function getSession(headers) {
  const cookieHeader = headers.get('cookie');
  const token = parseSessionCookie(cookieHeader);
  return decrypt(token);
}

module.exports = {
  encrypt,
  decrypt,
  setSession,
  clearSession,
  getSession,
  COOKIE_NAME,
};
