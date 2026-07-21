export const dynamic = 'force-dynamic';
/**
 * 彻底删除照片接口 (仅限系统管理员)
 * POST /api/admin/photo/delete
 *
 * 接收 pipeline_no, weld_no, photo_type。
 * 1. 查询数据库获取目标照片的 OSS Object Key (如果含 REJECTED: 前缀则剥离)
 * 2. 调用 OSS 客户端彻底删除云端文件：getOSSClient().delete(objectKey)
 * 3. 更新数据库将对应工序列置为 NULL
 * 4. 写入审计日志与 Pino 系统日志
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');
const { logger } = require('../../../../../lib/logger');
const { logAudit } = require('../../../../../lib/audit');
const { getOSSClient } = require('../../../../../lib/oss');

const PHOTO_TYPE_CN = { zudui: '组对', dadi: '打底', gaimian: '盖面' };

async function handler(request) {
  // 1. 校验管理员权限
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
      .prepare(`
        SELECT wr.id, wr.photo_zudui, wr.photo_dadi, wr.photo_gaimian
        FROM weld_records wr
        JOIN pipelines p ON wr.pipeline_id = p.id
        WHERE p.pipeline_no = ? AND wr.weld_no = ?
      `)
      .get(pipeline_no, weld_no);

    if (!record) {
      return Response.json({ success: false, error: '未找到该焊口记录' }, { status: 404 });
    }

    const colName = `photo_${photo_type}`;
    const rawVal = record[colName];

    if (!rawVal) {
      return Response.json({ success: false, error: '该工序暂无照片，无法删除' }, { status: 400 });
    }

    // 剥离 REJECTED: 前缀获取真实的 OSS Object Key
    const ossKey = rawVal.replace(/^REJECTED:/, '');

    // 2. 从 OSS 彻底删除云端对象
    try {
      const client = getOSSClient();
      await client.delete(ossKey);
      logger.info({ msg: 'oss.object_deleted', ossKey });
    } catch (ossErr) {
      logger.error({ msg: 'oss.delete_failed', ossKey, error: ossErr.message });
      // 如果报错，保留该日志继续向下清理 DB 记录
    }

    // 3. 更新 SQLite 数据库设为 NULL
    db.db
      .prepare(`UPDATE weld_records SET ${colName} = NULL WHERE id = ?`)
      .run(record.id);

    // 4. 写入审计与系统日志
    const typeCN = PHOTO_TYPE_CN[photo_type] || photo_type;
    logger.info({ msg: 'photo.deleted_by_admin', pipeline_no, weld_no, photo_type, ossKey });

    logAudit(
      'DELETE_PHOTO',
      `彻底删除管线 [${pipeline_no}] / 焊口 [${weld_no}] 的 [${typeCN}] 工序照片及 OSS 对象 [${ossKey}]`,
      { pipeline_no, weld_no, photo_type, ossKey }
    );

    return Response.json({ success: true, message: '照片及 OSS 对象已彻底删除' });
  } catch (err) {
    logger.error({ msg: 'photo.delete_failed', error: err.message });
    return Response.json({ success: false, error: '删除照片失败: ' + err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
