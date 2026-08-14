export const dynamic = 'force-dynamic';
/**
 * 工序字典与建设单位映射接口 (管理员权限)
 * GET /api/admin/photo-types
 *
 * 返回：完整工序列表、默认工序 keys、建设单位 → 工序映射。
 * 供管理端项目表单渲染工序勾选与「建设单位自动匹配」使用。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');
const photoTypes = require('../../../../lib/photo-types');

async function handler(request) {
  requireAdmin(request);
  return Response.json({
    success: true,
    photo_types: photoTypes.PHOTO_TYPES,
    default_process_keys: photoTypes.DEFAULT_PROCESS_KEYS,
    unit_process_map: db.getUnitProcessMap(),
  });
}

export const GET = withTrace(handler);
