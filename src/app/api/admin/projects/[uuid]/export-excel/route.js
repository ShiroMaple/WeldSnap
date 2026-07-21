export const dynamic = 'force-dynamic';
/**
 * 模板格式化 Excel 数据导出接口 (管理员权限)
 * POST /api/admin/projects/[uuid]/export-excel
 *
 * 导出当前项目/指定管线的全量焊口记录为 27 列标注质量管理 Excel 表。
 * 包含：序号、项目名称、施工号、管线号、焊口号、检查结果、并嵌入组对/打底/盖面照片 Buffer。
 * 无需依赖外部 public/demo.xlsx 文件，纯代码自主构建表头与格式。
 */

const ExcelJS = require('exceljs');
const { withTrace } = require('../../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../../middleware/auth');
const db = require('../../../../../../lib/db');
const { getOSSClient } = require('../../../../../../lib/oss');
const logger = require('../../../../../../lib/logger');

// 27 标准列定义
const DEMO_HEADERS = [
  '序号', '项目名称', '施工号', '建设单位', '装置名称', '施工单位', '图纸号',
  '管线号', '焊口号', '公称直径', '组对日期', '组对人', '坡口形式', '组对照片',
  '焊接日期', '打底焊接方法', '填充盖面焊接方法', '焊接位置', '打底焊工', '盖面焊工',
  '打底照片', '盖面照片', '检查状态', '检查结果', '检查人', '检查日期', '备注'
];

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

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Sheet1');

  // 1. 写入表头 (第 1 行)
  const headerRow = worksheet.addRow(DEMO_HEADERS);
  headerRow.height = 28;

  const colMap = {};
  headerRow.eachCell((cell, colNumber) => {
    const name = String(cell.value || '').trim();
    if (name) {
      colMap[name] = colNumber;
    }
    // 表头精致 Carbon 风格浅灰色背景与黑体
    cell.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FF161616' } };
    cell.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFF4F4F4' },
    };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      bottom: { style: 'medium', color: { argb: 'FFC6C6C6' } },
      right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
    };
  });

  // 2. 填充数据行（从第 2 行开始）
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
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
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

  // 设置合理列宽
  DEMO_HEADERS.forEach((h, index) => {
    const col = worksheet.getColumn(index + 1);
    if (['组对照片', '打底照片', '盖面照片'].includes(h)) {
      col.width = 18;
    } else if (['项目名称'].includes(h)) {
      col.width = 22;
    } else if (['管线号', '施工号'].includes(h)) {
      col.width = 16;
    } else if (['焊口号', '检查结果', '序号'].includes(h)) {
      col.width = 12;
    } else {
      col.width = 14;
    }
  });

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
