export const dynamic = 'force-dynamic';
/**
 * 前端直传 OSS 成功后的状态确认与回写 API (普通施工人员与管理员均可访问，需已登录)
 * POST /api/upload/confirm
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { setTraceField } = require('../../../../lib/trace');
const { confirmUpload } = require('../../../../services/upload.service');
const db = require('../../../../lib/db');

const { logAudit } = require('../../../../lib/audit');

const PHOTO_TYPE_CN = { zudui: '组对', dadi: '打底', gaimian: '盖面' };

async function handler(request) {
  const session = requireAuth(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求数据格式有误，需 JSON' }, { status: 400 });
  }

  const { weld_uuid, photo_type, objectKey } = body;

  if (!weld_uuid || !photo_type || !objectKey) {
    return Response.json({
      success: false,
      error: '缺少参数: weld_uuid, photo_type, objectKey'
    }, { status: 400 });
  }

  const weld = db.getWeldByUuid(weld_uuid);
  if (!weld) {
    return Response.json({ success: false, error: '未找到该焊口记录' }, { status: 404 });
  }

  setTraceField('pipeline_no', weld.pipeline_no);
  setTraceField('uploaded_by', session.display_name || session.username);

  try {
    confirmUpload(
      weld_uuid,
      photo_type,
      objectKey,
      session.display_name || session.username
    );

    const typeCN = PHOTO_TYPE_CN[photo_type] || photo_type;
    logAudit(
      'UPLOAD_PHOTO',
      `为管线 [${weld.pipeline_no}] / 焊口 [${weld.weld_no}] 上传了 [${typeCN}] 工序照片`,
      { weld_uuid, pipeline_no: weld.pipeline_no, weld_no: weld.weld_no, photo_type, objectKey }
    );

    return Response.json({ success: true, objectKey });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 });
  }
}

export const POST = withTrace(handler);
