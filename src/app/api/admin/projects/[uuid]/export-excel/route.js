export const dynamic = 'force-dynamic';
/**
 * 模板格式化 Excel 数据导出接口 (管理员权限)
 * POST /api/admin/projects/[uuid]/export-excel
 *
 * 依据 public/demo.xlsx 模板导出当前项目/指定管线的全量焊口记录。
 * 包含：项目名称、施工号、管线号、焊口号、检查结果、并嵌入组对/打底/盖面照片 Buffer。
 */

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const { withTrace } = require('../../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../../middleware/auth');
const db = require('../../../../../../lib/db');
const { getOSSClient } = require('../../../../../../lib/oss');
const logger = require('../../../../../../lib/logger');

// 从 OSS 获取照片 Buffer（若被标记驳回，剥离 REJECTED: 前缀进行云端检索）
async function fetchPhotoBuffer(photoKey) {
  if (!photoKey) return null;
  const cleanKey = String(photoKey).replace(/^REJECTED:/, '');
  try {
    const oss = getOSSClient();
    const result = await oss.get(cleanKey);
    if (result && result.content) {
      return result.content;
    }
  } catch (err) {
    logger.warn({ msg: 'export.fetch_photo_failed', photoKey, error: err.message });
  }
  return null;
}

// 格式化时间戳 YYYYMMDDHHmmss
function getFormattedTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const min = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  return `${yyyy}${mm}${dd}${hh}${min}${ss}`;
}

async function handler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少项目标识 project_uuid' }, { status: 400 });
  }

  // 解析 POST body 中的 pipeline_uuids 参数（若为空数组则导出项目完整数据）
  let pipelineUuids = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.pipeline_uuids)) {
      pipelineUuids = body.pipeline_uuids;
    }
  } catch {
    // 若非 JSON Body 则默认导出完整项目数据
  }

  const { project, records } = db.getProjectExportRecords(uuid, pipelineUuids);
  if (!project) {
    return Response.json({ success: false, error: '项目不存在' }, { status: 404 });
  }

  // 读取模板文件 public/demo.xlsx
  const templatePath = path.join(process.cwd(), 'public', 'demo.xlsx');
  if (!fs.existsSync(templatePath)) {
    return Response.json({ success: false, error: '后端缺失 Excel 导出模板 (public/demo.xlsx)' }, { status: 500 });
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const worksheet = workbook.getWorksheet(1);

  // 匹配表头列名索引（1-indexed）
  const colMap = {};
  const headerRow = worksheet.getRow(1);
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value || '').trim();
    if (name) {
      colMap[name] = colNumber;
    }
  });

  // 填充数据行（从第 2 行开始）
  let currentRowIndex = 2;

  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const row = worksheet.getRow(currentRowIndex);
    row.height = 65; // 设置含有照片嵌入的行高

    // 检查结果判断规则：在有图片的前提下才显示合格或不合格，无图片时留空；若有任意照片包含 REJECTED: 标记则为“不合格”
    const hasAnyPhoto = !!(r.photo_zudui || r.photo_dadi || r.photo_gaimian);
    const hasRejected =
      (r.photo_zudui && r.photo_zudui.startsWith('REJECTED:')) ||
      (r.photo_dadi && r.photo_dadi.startsWith('REJECTED:')) ||
      (r.photo_gaimian && r.photo_gaimian.startsWith('REJECTED:'));

    let checkResult = '';
    if (hasAnyPhoto) {
      checkResult = hasRejected ? '不合格' : '合格';
    }

    // 基础文字列映射
    if (colMap['序号']) row.getCell(colMap['序号']).value = i + 1;
    if (colMap['项目名称']) row.getCell(colMap['项目名称']).value = r.project_name || '';
    if (colMap['施工号']) row.getCell(colMap['施工号']).value = r.construction_no || '';
    if (colMap['管线号']) row.getCell(colMap['管线号']).value = r.pipeline_no || '';
    if (colMap['焊口号']) row.getCell(colMap['焊口号']).value = r.weld_no || '';
    if (colMap['检查结果']) row.getCell(colMap['检查结果']).value = checkResult;

    // 单元格对齐样式与字体设置
    row.eachCell((cell) => {
      cell.alignment = { vertical: 'middle', horizontal: 'center' };
      cell.font = { name: 'Arial', size: 10 };
    });

    // 照片抓取与单元格图像嵌入
    const photosToFetch = [
      { key: r.photo_zudui, colName: '组对照片' },
      { key: r.photo_dadi, colName: '打底照片' },
      { key: r.photo_gaimian, colName: '盖面照片' },
    ];

    for (const p of photosToFetch) {
      const colNum = colMap[p.colName];
      if (colNum && p.key) {
        const imgBuffer = await fetchPhotoBuffer(p.key);
        if (imgBuffer) {
          try {
            const isPng = imgBuffer[0] === 0x89 && imgBuffer[1] === 0x50;
            const imageId = workbook.addImage({
              buffer: imgBuffer,
              extension: isPng ? 'png' : 'jpeg',
            });

            worksheet.addImage(imageId, {
              tl: { col: colNum - 1 + 0.05, row: currentRowIndex - 1 + 0.05 },
              br: { col: colNum - 0.05, row: currentRowIndex - 0.05 },
              editAs: 'oneCell',
            });
          } catch (imgErr) {
            logger.warn({ msg: 'export.embed_image_error', photoKey: p.key, error: imgErr.message });
          }
        }
      }
    }

    row.commit();
    currentRowIndex++;
  }

  // 适当扩展列宽
  if (colMap['组对照片']) worksheet.getColumn(colMap['组对照片']).width = 18;
  if (colMap['打底照片']) worksheet.getColumn(colMap['打底照片']).width = 18;
  if (colMap['盖面照片']) worksheet.getColumn(colMap['盖面照片']).width = 18;
  if (colMap['管线号']) worksheet.getColumn(colMap['管线号']).width = 16;
  if (colMap['项目名称']) worksheet.getColumn(colMap['项目名称']).width = 22;

  // 生成 xlsx Buffer
  const buffer = await workbook.xlsx.writeBuffer();

  const timestamp = getFormattedTimestamp();
  const rawFileName = `${project.project_name || '项目'}_管道焊接过程质量管理基本信息_${timestamp}.xlsx`;

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(rawFileName)}"; filename*=UTF-8''${encodeURIComponent(rawFileName)}`,
    },
  });
}

export const POST = withTrace(handler);
