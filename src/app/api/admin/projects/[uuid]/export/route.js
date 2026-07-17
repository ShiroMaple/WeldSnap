export const dynamic = 'force-dynamic';
/**
 * 导出项目数据接口 (管理员权限)
 * GET /api/admin/projects/[uuid]/export
 *
 * 导出该项目下所有管线+焊口为 Excel（uuid | 管线号 | 焊口号 | 创建来源）。
 * 下载后可编辑再通过导入接口回传，利用 uuid 精确更新。
 */

const { withTrace } = require('../../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../../middleware/auth');
const db = require('../../../../../../lib/db');
const XLSX = require('xlsx');

async function handler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少项目标识' }, { status: 400 });
  }

  const project = db.getProjectByUuid(uuid);
  if (!project) {
    return Response.json({ success: false, error: '项目不存在' }, { status: 404 });
  }

  const rows = db.exportProjectData(uuid);

  // 构造 Excel 数据：仅业务字段，不含 uuid
  const header = ['管线号', '焊口号', '创建来源'];
  const data = rows.map(r => [r.pipeline_no, r.weld_no, r.create_source]);

  const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
  ws['!cols'] = [
    { wch: 15 }, // 管线号
    { wch: 10 }, // 焊口号
    { wch: 18 }, // 创建来源
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '焊口数据');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  // 文件名包含施工号便于识别
  const safeName = (project.construction_no || 'export').replace(/[^a-zA-Z0-9一-龥_-]/g, '');
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="weldsnap_${safeName}.xlsx"`,
    },
  });
}

export const GET = withTrace(handler);
