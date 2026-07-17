export const dynamic = 'force-dynamic';
/**
 * 下载导入模板接口 (管理员权限)
 * GET /api/admin/export-template
 *
 * 生成含 uuid | 管线号 | 焊口号 表头的空 Excel 模板供下载。
 * uuid 列留空表示新建记录；填写已有 uuid 表示更新对应焊口号。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const XLSX = require('xlsx');

async function handler(request) {
  requireAdmin(request);

  const headers = ['管线号', '焊口号'];
  const exampleRow = ['PL-001', 'W-01'];

  const ws = XLSX.utils.aoa_to_sheet([headers, exampleRow]);

  // 设置列宽，提升可读性
  ws['!cols'] = [
    { wch: 15 }, // 管线号
    { wch: 10 }, // 焊口号
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '导入模板');

  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="weldsnap_import_template.xlsx"',
    },
  });
}

export const GET = withTrace(handler);
