export const dynamic = 'force-dynamic';
/**
 * 标记照片为不合格接口 (仅限系统管理员)
 * POST /api/admin/photo/reject
 *
 * 接收 pipeline_no, weld_no, photo_type。
 * 如果对应的工序照片已上传且未被标记，则将其数据库存储值前缀加上 "REJECTED:"。
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');
const { logger } = require('../../../../../lib/logger');

async function handler(request) {
  // 校验管理员身份
  requireAdmin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { pipeline_no, weld_no, photo_type } = body;

  if (!pipeline_no || !weld_no || !photo_type) {
    return Response.json({ success: false, error: '缺少必需的字段' }, { status: 400 });
  }

  if (!['zudui', 'dadi', 'gaimian'].includes(photo_type)) {
    return Response.json({ success: false, error: '无效的工序类型' }, { status: 400 });
  }

  try {
    const record = db.db
      .prepare('SELECT photo_zudui, photo_dadi, photo_gaimian FROM weld_records WHERE pipeline_no = ? AND weld_no = ?')
      .get(pipeline_no, weld_no);

    if (!record) {
      return Response.json({ success: false, error: '未找到该焊口记录' }, { status: 404 });
    }

    const colName = `photo_${photo_type}`;
    const currentVal = record[colName];

    if (!currentVal) {
      return Response.json({ success: false, error: '该工序尚未上传照片，无法标记' }, { status: 400 });
    }

    if (currentVal.startsWith('REJECTED:')) {
      return Response.json({ success: false, error: '该照片已经被标记为不合格' }, { status: 400 });
    }

    const newVal = `REJECTED:${currentVal}`;

    db.db
      .prepare(`UPDATE weld_records SET ${colName} = ? WHERE pipeline_no = ? AND weld_no = ?`)
      .run(newVal, pipeline_no, weld_no);

    logger.info({ msg: 'photo.rejected_by_admin', pipeline_no, weld_no, photo_type });

    return Response.json({ success: true });
  } catch (err) {
    logger.error({ msg: 'photo.reject_failed', error: err.message });
    return Response.json({ success: false, error: '数据库更新失败: ' + err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
