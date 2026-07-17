/**
 * 现场与管理后台新增焊口通用接口 (需登录)
 * POST /api/welds
 *
 * 接收 pipeline_uuid 与可选的 weld_no。
 * 根据用户角色自动判断创建来源，并支持自动前缀编号。
 */

const { withTrace } = require('../../../middleware/withTrace');
const { requireAuth } = require('../../../middleware/auth');
const db = require('../../../lib/db');

async function postHandler(request) {
  // 仅限已登录用户（普通工人和管理员均可）
  const user = requireAuth(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { pipeline_uuid, weld_no } = body;

  if (!pipeline_uuid) {
    return Response.json({ success: false, error: '缺少 pipeline_uuid 参数' }, { status: 400 });
  }

  const createSource = (user.role === 'admin' || user.role === 'project_admin') ? '管理控制台创建' : '现场创建';

  const result = db.createWeld(pipeline_uuid, weld_no, createSource);
  if (result.success) {
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const POST = withTrace(postHandler);
