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
  construction_no: ['施工号', 'construction_no'],
  project_name: ['项目名称', 'project_name'],
  owner_unit: ['建设单位', 'owner_unit'],
  construction_unit: ['施工单位', 'construction_unit'],
  completion_status: ['项目完工状态', 'completion_status', '状态'],
  remark: ['项目备注', 'remark'],
  pipeline_prefix: ['管线号前缀', 'pipeline_prefix'],
  weld_prefix: ['焊口号前缀', 'weld_prefix'],
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
    owner_unit: colMap.owner_unit ? String(r[colMap.owner_unit]).trim() : '',
    construction_unit: colMap.construction_unit ? String(r[colMap.construction_unit]).trim() : '',
    completion_status: colMap.completion_status ? String(r[colMap.completion_status]).trim() : '进行中',
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
