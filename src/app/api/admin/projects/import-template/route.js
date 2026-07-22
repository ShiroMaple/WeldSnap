export const dynamic = 'force-dynamic';
/**
 * 下载施工项目导入 Excel 模板接口 (管理员权限)
 * GET /api/admin/projects/import-template
 */

const XLSX = require('xlsx');
const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');

async function handler(request) {
  requireAdmin(request);

  const sampleData = [
    {
      '施工号 (必填)': 'SG-2026-001',
      '项目名称 (必填)': '常减压蒸馏装置管道工程',
      '建设单位 (选填)': '中国石化分公司',
      '施工单位 (选填)': '中石化十建公司',
      '项目完工状态 (选填)': '进行中',
      '项目备注 (选填)': '一期重点工程项目',
      '管线号前缀 (选填)': 'PL',
      '焊口号前缀 (选填)': 'W',
    },
    {
      '施工号 (必填)': 'SG-2026-002',
      '项目名称 (必填)': '乙烯裂解炉改造项目',
      '建设单位 (选填)': '中国石油分公司',
      '施工单位 (选填)': '中石油一建公司',
      '项目完工状态 (选填)': '进行中',
      '项目备注 (选填)': '',
      '管线号前缀 (选填)': 'ETH',
      '焊口号前缀 (选填)': 'W',
    },
  ];

  const worksheet = XLSX.utils.json_to_sheet(sampleData);
  worksheet['!cols'] = [
    { wch: 18 },
    { wch: 28 },
    { wch: 22 },
    { wch: 22 },
    { wch: 20 },
    { wch: 20 },
    { wch: 18 },
    { wch: 18 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '项目导入模板');

  const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent('施工项目批量导入模板.xlsx'),
    },
  });
}

export const GET = withTrace(handler);
