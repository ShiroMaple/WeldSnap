/**
 * 前端直传 OSS 成功后的状态确认与回写 API (普通施工人员与管理员均可访问，需已登录)
 * POST /api/upload/confirm
 *
 * 手机端将大体积照片成功直传云端 OSS 后，向本 API 发送轻量级状态确认 JSON。
 * 服务端核实后将照片在 OSS 中的 Object Key 相对路径写入 SQLite 对应字段。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { setTraceField } = require('../../../../lib/trace');
const { confirmUpload } = require('../../../../services/upload.service');

async function handler(request) {
  // 1. 鉴权：需要已登录会话
  const session = requireAuth(request);

  // 2. 解析请求体
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求数据格式有误，需 JSON' }, { status: 400 });
  }

  const { pipeline_no, weld_no, photo_type, objectKey } = body;

  // 3. 必需参数校验
  if (!pipeline_no || !weld_no || !photo_type || !objectKey) {
    return Response.json({
      success: false,
      error: '缺少参数: pipeline_no, weld_no, photo_type, objectKey'
    }, { status: 400 });
  }

  // 4. 将业务数据注入 ALS 追踪隔离舱，让随后的操作日志携带可追踪属性
  setTraceField('pipeline_no', pipeline_no);
  setTraceField('uploaded_by', session.display_name || session.username);

  // 5. 写入数据库对应字段
  try {
    confirmUpload(
      pipeline_no,
      weld_no,
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

