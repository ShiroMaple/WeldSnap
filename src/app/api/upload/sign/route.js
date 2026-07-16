/**
 * OSS 预签名 URL 派发端点
 * POST /api/upload/sign
 *
 * 请求体 (JSON):
 *   {
 *     "weld_uuid":  "焊口 UUID",
 *     "photo_type": "zudui | dadi | gaimian"
 *   }
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { setTraceField } = require('../../../../lib/trace');
const { generatePresignedUrl } = require('../../../../services/upload.service');
const { logger } = require('../../../../lib/logger');
const db = require('../../../../lib/db');

const VALID_PHOTO_TYPES = ['zudui', 'dadi', 'gaimian'];

async function handler(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: '请求体格式错误，需要 JSON' },
      { status: 400 }
    );
  }

  const { weld_uuid, photo_type } = body;

  if (!weld_uuid || !photo_type) {
    return Response.json(
      {
        success: false,
        error: '缺少参数: weld_uuid, photo_type',
      },
      { status: 400 }
    );
  }

  if (!VALID_PHOTO_TYPES.includes(photo_type)) {
    return Response.json(
      {
        success: false,
        error: `无效的 photo_type: "${photo_type}"`,
      },
      { status: 400 }
    );
  }

  const session = requireAuth(request);
  const operator = session.display_name || session.username;

  // 查库获取焊口对应的管线号供全链路日志追踪
  const weld = db.getWeldByUuid(weld_uuid);
  if (!weld) {
    return Response.json({ success: false, error: '未找到该焊口记录' }, { status: 404 });
  }

  setTraceField('pipeline_no', weld.pipeline_no);
  setTraceField('uploaded_by', operator);

  try {
    const result = generatePresignedUrl(weld_uuid, photo_type);

    return Response.json({
      success: true,
      signedUrl: result.signedUrl,
      objectKey: result.objectKey,
      expiresIn: result.expiresIn,
    });
  } catch (err) {
    logger.error({ msg: 'sign.failed', error: err.message });
    return Response.json(
      { success: false, error: err.message },
      { status: 400 }
    );
  }
}

export const POST = withTrace(handler);
