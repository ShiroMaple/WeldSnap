/**
 * 获取及保存系统配置接口 (管理员权限)
 *
 * GET  /api/admin/settings - 获取脱敏后的云端 OSS 配置及服务器局域网地址
 * POST /api/admin/settings - 配置保存占位（云原生架构下配置推荐通过环境变量控制）
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const { getLocalIPs } = require('../../../../lib/ip');
const { getOSSConfig } = require('../../../../lib/env');

/**
 * 字符掩码脱敏
 * @param {string} str
 * @returns {string}
 */
function maskSecret(str) {
  if (!str || str.length < 6) return '******';
  return str.substring(0, 6) + '***' + str.substring(str.length - 4);
}

async function getHandler(request) {
  requireAdmin(request);

  // 1. 获取本地局域网 IP
  const ips = getLocalIPs();
  const port = process.env.PORT || 3000;

  // 2. 获取并脱敏 OSS 基础元数据
  let ossMeta = {};
  try {
    const rawOss = getOSSConfig();
    ossMeta = {
      bucket: rawOss.bucket,
      region: rawOss.region,
      endpoint: rawOss.endpoint,
      accessKeyId: maskSecret(rawOss.accessKeyId),
    };
  } catch (err) {
    // 环境变量未注入时返回空信息
    ossMeta = { error: '未注入 OSS 环境变量' };
  }

  return Response.json({
    success: true,
    config: {
      oss: ossMeta,
      exportMode: 'OSS_DIRECT',
    },
    serverIPs: ips,
    port: parseInt(port, 10),
  });
}

async function postHandler(request) {
  requireAdmin(request);
  // 在云原生架构中，敏感凭证及核心系统参数应当完全通过环境变量控制
  // 故此处不对本地进行持久化写回，直接返回 success 兼容旧版 admin.js 调用
  return Response.json({
    success: true,
    msg: '云原生架构下，配置已通过系统环境变量持久锁定。',
  });
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);

