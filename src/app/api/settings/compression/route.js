/**
 * 照片压缩参数公开接口（无需管理员权限）
 * GET /api/settings/compression
 *
 * 供前端上传组件（管理台 WeldMatrix、移动端 upload 页面）读取当前压缩配置。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const db = require('../../../../lib/db');

async function handler() {
  const settings = db.getAllSettings();

  return Response.json({
    success: true,
    compression: {
      enabled: settings.compress_enabled === '1',
      maxWidth: parseInt(settings.compress_max_width, 10),
      maxHeight: parseInt(settings.compress_max_height, 10),
      quality: parseFloat(settings.compress_quality),
    },
  });
}

export const GET = withTrace(handler);
