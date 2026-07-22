export const dynamic = 'force-dynamic';
/**
 * 特定项目更新与删除 API 接口 (系统管理员权限)
 * PUT    /api/admin/projects/[uuid] - 更新项目配置
 * DELETE /api/admin/projects/[uuid] - 删除项目及级联管线焊口
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');

const { logAudit } = require('../../../../../lib/audit');

async function putHandler(request, { params }) {
  requireAdmin(request);

  const resolvedParams = await params;
  const uuid = resolvedParams.uuid;

  if (!uuid) {
    return Response.json({ success: false, error: '缺少项目 UUID' }, { status: 400 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { construction_no, project_name, remark, pipeline_prefix, weld_prefix, status, completion_status, owner_unit, construction_unit } = body;

  const finalStatus = completion_status || status || '进行中';

  if (!construction_no || !construction_no.trim()) {
    return Response.json({ success: false, error: '项目施工号不能为空' }, { status: 400 });
  }
  if (!project_name || !project_name.trim()) {
    return Response.json({ success: false, error: '项目名称不能为空' }, { status: 400 });
  }
  if (!['进行中', '已完工'].includes(finalStatus)) {
    return Response.json({ success: false, error: '项目完工状态不合法' }, { status: 400 });
  }

  const result = db.updateProject(
    uuid,
    construction_no,
    project_name,
    remark,
    pipeline_prefix,
    weld_prefix,
    finalStatus,
    owner_unit || '',
    construction_unit || ''
  );

  if (result.success) {
    logAudit(
      'UPDATE_PROJECT',
      `修改了项目 "${project_name.trim()}" 的基本信息 (施工号: ${construction_no.trim()}, 状态: ${status})`,
      { uuid, project_name: project_name.trim(), status }
    );
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

async function deleteHandler(request, { params }) {
  requireAdmin(request); // 必须是系统管理员

  const resolvedParams = await params;
  const uuid = resolvedParams.uuid;

  if (!uuid) {
    return Response.json({ success: false, error: '缺少项目 UUID' }, { status: 400 });
  }

  const proj = db.getProjectByUuid(uuid);

  const result = db.deleteProject(uuid);
  if (result.success) {
    logAudit(
      'DELETE_PROJECT',
      `删除了项目 "${proj ? proj.project_name : uuid}" ${proj ? `(施工号: ${proj.construction_no})` : ''}`,
      { uuid, construction_no: proj?.construction_no }
    );
    return Response.json(result);
  } else {
    return Response.json(result, { status: 400 });
  }
}

export const PUT = withTrace(putHandler);
export const DELETE = withTrace(deleteHandler);
