/**
 * 前端直传 OSS 成功后的状态确认与回写 API (普通施工人员与管理员均可访问，需已登录)
 * POST /api/upload/confirm
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { setTraceField } = require('../../../../lib/trace');
const { confirmUpload } = require('../../../../services/upload.service');
const db = require('../../../../lib/db');

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

    return Response.json({ success: true, objectKey });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 400 });
  }
}

export const POST = withTrace(handler);
