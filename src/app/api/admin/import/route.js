export const dynamic = 'force-dynamic';
/**
 * 导入 Excel 焊口信息数据接口 (管理员权限)
 * POST /api/admin/import
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const db = require('../../../../lib/db');
const XLSX = require('xlsx');

// 必需列的匹配规则（与 V1.0 保持一致，支持模糊匹配）
const POSSIBLE_NAMES = {
  seq_no: ['序号', '序', 'seq', 'no'],
  project_name: ['项目名称', '项目'],
  construction_no: ['施工号', '施工'],
  project_no: ['项目号'],
  pipeline_no: ['管线号', '管线'],
  weld_no: ['焊口号', '焊口', '焊缝号', '焊缝'],
};

async function handler(request) {
  requireAdmin(request);

  // 1. 获取 Form 字段中的文件
  let formData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json({ success: false, error: '请求数据格式有误，需 multipart/form-data' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return Response.json({ success: false, error: '请选择要上传的 Excel 文件' }, { status: 400 });
  }

  const projectUuid = formData.get('project_uuid');
  if (!projectUuid) {
    return Response.json({ success: false, error: '缺少必需的项目标识 project_uuid' }, { status: 400 });
  }

  // 2. 将上传 of File 读入 Buffer 并通过 xlsx 解析
  let workbook;
  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } catch (err) {
    return Response.json({ success: false, error: '无法读取 Excel 文件，可能文件损坏' }, { status: 400 });
  }

  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  // defval: '' 确保不存在的单元格返回空字符串而不是 undefined
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) {
    return Response.json({ success: false, error: 'Excel 文件内容为空' }, { status: 400 });
  }

  // 3. 列名模糊匹配算法
  const colMap = {};
  const headers = Object.keys(rows[0]);

  for (const [field, names] of Object.entries(POSSIBLE_NAMES)) {
    for (const h of headers) {
      const lower = h.toLowerCase().trim();
      if (names.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
        colMap[field] = h;
        break;
      }
    }
  }

  // 4. 必需字段校验
  if (!colMap.pipeline_no || !colMap.weld_no) {
    return Response.json({
      success: false,
      error: 'Excel 缺少必需的列：【管线号】或【焊口号】。请确保表头命名正确。'
    }, { status: 400 });
  }

  // 5. 过滤并构造插入数据
  const records = rows
    .map(r => ({
      seq_no: colMap.seq_no ? String(r[colMap.seq_no]) : '',
      project_name: colMap.project_name ? String(r[colMap.project_name]) : '',
      construction_no: colMap.construction_no ? String(r[colMap.construction_no]) : '',
      project_no: colMap.project_no ? String(r[colMap.project_no]) : '',
      pipeline_no: String(r[colMap.pipeline_no]).trim(),
      weld_no: String(r[colMap.weld_no]).trim(),
    }))
    .filter(r => r.pipeline_no && r.weld_no); // 确保非空

  if (records.length === 0) {
    return Response.json({ success: false, error: '没有解析到有效的管线号与焊口号数据' }, { status: 400 });
  }

  // 6. 执行事务入库
  const result = db.importWeldRecords(records, projectUuid);

  return Response.json({
    success: true,
    ...result,
    mapped: colMap,
  });
}

export const POST = withTrace(handler);

