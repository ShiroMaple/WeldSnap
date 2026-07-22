export const dynamic = 'force-dynamic';
/**
 * 获取及保存系统配置接口 (系统管理员权限)
 *
 * GET  /api/admin/settings - 获取脱敏后的云端 OSS 配置及服务器局域网地址
 * POST /api/admin/settings - 配置保存占位（云原生架构下配置推荐通过环境变量控制）
 *
 * 仅系统管理员 (admin) 可访问。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireSystemAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');
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
  requireSystemAdmin(request);

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

  // 3. 获取照片压缩参数
  const compression = db.getAllSettings();

  return Response.json({
    success: true,
    config: {
      oss: ossMeta,
      exportMode: 'OSS_DIRECT',
      server_public_url: compression.server_public_url || '',
      compression: {
        enabled: compression.compress_enabled === '1',
        maxWidth: parseInt(compression.compress_max_width, 10),
        maxHeight: parseInt(compression.compress_max_height, 10),
        quality: parseFloat(compression.compress_quality),
      },
      excelCompression: {
        enabled: compression.excel_compress_enabled === '1',
        maxWidth: parseInt(compression.excel_compress_max_width, 10),
        maxHeight: parseInt(compression.excel_compress_max_height, 10),
        quality: parseFloat(compression.excel_compress_quality),
      },
    },
    serverIPs: ips,
    port: parseInt(port, 10),
  });
}

async function postHandler(request) {
  requireSystemAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { compression, excelCompression, server_public_url } = body;
  if (server_public_url !== undefined) {
    db.setSetting('server_public_url', server_public_url.trim());
  }

  if (compression) {
    if (compression.enabled !== undefined) {
      db.setSetting('compress_enabled', compression.enabled ? '1' : '0');
    }
    if (compression.maxWidth !== undefined) {
      db.setSetting('compress_max_width', String(compression.maxWidth));
    }
    if (compression.maxHeight !== undefined) {
      db.setSetting('compress_max_height', String(compression.maxHeight));
    }
    if (compression.quality !== undefined) {
      db.setSetting('compress_quality', String(compression.quality));
    }
  }

  if (excelCompression) {
    if (excelCompression.enabled !== undefined) {
      db.setSetting('excel_compress_enabled', excelCompression.enabled ? '1' : '0');
    }
    if (excelCompression.maxWidth !== undefined) {
      db.setSetting('excel_compress_max_width', String(excelCompression.maxWidth));
    }
    if (excelCompression.maxHeight !== undefined) {
      db.setSetting('excel_compress_max_height', String(excelCompression.maxHeight));
    }
    if (excelCompression.quality !== undefined) {
      db.setSetting('excel_compress_quality', String(excelCompression.quality));
    }
  }

  return Response.json({ success: true });
}

export const GET = withTrace(getHandler);
export const POST = withTrace(postHandler);

