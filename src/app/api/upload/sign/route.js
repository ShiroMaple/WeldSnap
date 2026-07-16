/**
 * OSS 预签名 URL 派发端点
 *
 * POST /api/upload/sign
 *
 * 请求体 (JSON):
 *   {
 *     "pipeline_no": "管线号",
 *     "weld_no":     "焊口号",
 *     "photo_type":  "zudui | dadi | gaimian"
 *   }
 *
 * 响应体 (JSON):
 *   {
 *     "success":   true,
 *     "signedUrl":  "https://bucket.oss-cn-xxx.aliyuncs.com/projects/...?Expires=...&Signature=...",
 *     "objectKey":  "projects/项目A_施工01/管线01/焊口01/管线01-焊口01-组对.jpg",
 *     "expiresIn":  60
 *   }
 *
 * 安全机制:
 *   - withTrace 自动注入 traceId + 全链路日志
 *   - 身份认证占位（当前阶段通过 X-Auth-Token 头简易校验，后续接入完整 Session）
 *   - 业务上下文 (pipeline_no, uploaded_by) 动态写入 ALS，确保日志全链路可追踪
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { setTraceField } = require('../../../../lib/trace');
const { generatePresignedUrl } = require('../../../../services/upload.service');
const { logger } = require('../../../../lib/logger');

const VALID_PHOTO_TYPES = ['zudui', 'dadi', 'gaimian'];

/**
 * 核心路由处理函数
 * @param {Request} request
 * @returns {Promise<Response>}
 */
async function handler(request) {
  // ─── 1. 解析请求体 ──────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { success: false, error: '请求体格式错误，需要 JSON' },
      { status: 400 }
    );
  }

  const { pipeline_no, weld_no, photo_type } = body;

  // ─── 2. 校验必需字段 ───────────────────────────────────
  if (!pipeline_no || !weld_no || !photo_type) {
    return Response.json(
      {
        success: false,
        error: '缺少必需参数: pipeline_no, weld_no, photo_type',
      },
      { status: 400 }
    );
  }

  if (!VALID_PHOTO_TYPES.includes(photo_type)) {
    return Response.json(
      {
        success: false,
        error: `无效的 photo_type: "${photo_type}"，可选值: ${VALID_PHOTO_TYPES.join(', ')}`,
      },
      { status: 400 }
    );
  }

  // ─── 3. 身份认证 ──────────────────────────────
  const session = requireAuth(request);
  const operator = session.display_name || session.username;

  // ─── 4. 注入业务上下文到 ALS ─────────────────────────
  setTraceField('pipeline_no', pipeline_no);
  setTraceField('uploaded_by', operator);

  // ─── 5. 生成预签名 URL ───────────────────────────────
  try {
    const result = generatePresignedUrl(pipeline_no, weld_no, photo_type);

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

// 导出 withTrace 包装后的 POST 处理函数
export const POST = withTrace(handler);

