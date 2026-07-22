export const dynamic = 'force-dynamic';
/**
 * 批量导入施工项目接口 (管理员权限)
 * POST /api/admin/projects/import
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const db = require('../../../../../lib/db');
const XLSX = require('xlsx');

// 匹配列名的映射规则
const PROJECT_COLUMNS = {
  construction_no: ['施工号', '施工编号', '项目施工号', 'construction_no'],
  project_name: ['项目名称', '项目全称', '工程名称', 'project_name'],
  remark: ['项目备注', '备注', 'remark'],
  pipeline_prefix: ['管线号前缀', '管线前缀', '管线前缀号', 'pipeline_prefix'],
  weld_prefix: ['焊口号前缀', '焊口前缀', '焊口前缀号', 'weld_prefix'],
};

async function handler(request) {
  requireAdmin(request);

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ success: false, error: '请求格式错误，需 multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ success: false, error: '请选择要上传的 Excel 文件 (.xlsx / .xls)' }, { status: 400 });
  }

  let workbook;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return Response.json({ success: false, error: '无法读取 Excel 文件，请确认文件格式正确' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    return Response.json({ success: false, error: 'Excel 文件内容为空' }, { status: 400 });
  }

  // 表头匹配
  const colMap = {};
  const headers = Object.keys(rows[0]);

  for (const [field, names] of Object.entries(PROJECT_COLUMNS)) {
    for (const h of headers) {
      const lower = h.toLowerCase().trim();
      if (names.some((n) => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
        colMap[field] = h;
        break;
      }
    }
  }

  if (!colMap.construction_no || !colMap.project_name) {
    return Response.json({
      success: false,
      error: 'Excel 缺少必需的表头列：【施工号】与【项目名称】。请使用标准项目导入模板。',
    }, { status: 400 });
  }

  const records = rows.map((r) => ({
    construction_no: colMap.construction_no ? String(r[colMap.construction_no]).trim() : '',
    project_name: colMap.project_name ? String(r[colMap.project_name]).trim() : '',
    remark: colMap.remark ? String(r[colMap.remark]).trim() : '',
    pipeline_prefix: colMap.pipeline_prefix ? String(r[colMap.pipeline_prefix]).trim() : '',
    weld_prefix: colMap.weld_prefix ? String(r[colMap.weld_prefix]).trim() : '',
  }));

  const result = db.importProjects(records);

  return Response.json({
    success: true,
    ...result,
  });
}

export const POST = withTrace(handler);
