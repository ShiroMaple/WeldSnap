export const dynamic = 'force-dynamic';
/**
 * 模板格式化 Excel 数据导出接口 (管理员权限 - 流式响应 + 并发 OSS 拉取 + 图片瘦身)
 * POST /api/admin/projects/[uuid]/export-excel
 *
 * 导出当前项目/指定管线的全量焊口记录为 27 列标注质量管理 Excel 表。
 * 返回 Content-Type: application/x-ndjson 格式的 HTTP 实时数据流：
 *   - type: "start"      => 初始化进度
 *   - type: "progress"   => 实时报告当前进度 percentage, 已拉取照片数, 已填充焊口数
 *   - type: "done"       => 导出完成，包含 fileName 与 Base64 产物数据
 */

const ExcelJS = require('exceljs');
const { withTrace } = require('../../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../../middleware/auth');
const db = require('../../../../../../lib/db');
const { getOSSClient } = require('../../../../../../lib/oss');
const logger = require('../../../../../../lib/logger');

let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  logger.info({ msg: 'export.sharp_not_available', error: e.message });
}

// 27 标准列定义
const DEMO_HEADERS = [
  '序号', '项目名称', '施工号', '建设单位', '装置名称', '施工单位', '图纸号',
  '管线号', '焊口号', '公称直径', '组对日期', '组对人', '坡口形式', '组对照片',
  '焊接日期', '打底焊接方法', '填充盖面焊接方法', '焊接位置', '打底焊工', '盖面焊工',
  '打底照片', '盖面照片', '检查状态', '检查结果', '检查人', '检查日期', '备注'
];

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

// 从 OSS 获取照片 Buffer 并根据系统配置决定是否进行 sharp 缩略图瘦身
async function fetchAndProcessPhoto(photoKey, compressConfig) {
  if (!photoKey) return null;
  const cleanKey = String(photoKey).replace(/^REJECTED:/, '');
  try {
    const oss = getOSSClient();
    const result = await oss.get(cleanKey);
    if (!result || !result.content) return null;

    let buf = result.content;

    // 若系统管理员开启了导出照片压缩且 sharp 依赖可用
    if (compressConfig.enabled && sharp) {
      try {
        buf = await sharp(buf)
          .resize({
            width: compressConfig.maxWidth || 400,
            height: compressConfig.maxHeight || 300,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: Math.round((compressConfig.quality || 0.8) * 100) })
          .toBuffer();
      } catch (resizeErr) {
        logger.warn({ msg: 'export.sharp_resize_error', photoKey, error: resizeErr.message });
      }
    }

    return buf;
  } catch (err) {
    logger.warn({ msg: 'export.fetch_photo_failed', photoKey, error: err.message });
  }
  return null;
}

// 并发池批处理函数
async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

async function handler(request, { params }) {
  requireAdmin(request);

  const { uuid } = await params;
  if (!uuid) {
    return Response.json({ success: false, error: '缺少项目标识 project_uuid' }, { status: 400 });
  }

  let pipelineUuids = [];
  try {
    const body = await request.json();
    if (Array.isArray(body.pipeline_uuids)) {
      pipelineUuids = body.pipeline_uuids;
    }
  } catch { }

  const { project, records } = db.getProjectExportRecords(uuid, pipelineUuids);
  if (!project) {
    return Response.json({ success: false, error: '项目不存在' }, { status: 404 });
  }

  // 1. 读取系统配置中的 Excel 导出压缩参数
  const allSettings = db.getAllSettings();
  const compressConfig = {
    enabled: allSettings.excel_compress_enabled === '1',
    maxWidth: parseInt(allSettings.excel_compress_max_width || '800', 10),
    maxHeight: parseInt(allSettings.excel_compress_max_height || '600', 10),
    quality: parseFloat(allSettings.excel_compress_quality || '0.8'),
  };

  // 2. 收集全量待拉取的 OSS 照片任务
  const photoTasks = [];
  records.forEach((r, recordIndex) => {
    [
      { key: r.photo_zudui, type: 'zudui', colName: '组对照片' },
      { key: r.photo_dadi, type: 'dadi', colName: '打底照片' },
      { key: r.photo_gaimian, type: 'gaimian', colName: '盖面照片' },
    ].forEach((p) => {
      if (p.key) {
        photoTasks.push({
          recordIndex,
          photoKey: p.key,
          type: p.type,
          colName: p.colName,
        });
      }
    });
  });

  const totalRecords = records.length;
  const totalPhotos = photoTasks.length;

  // 使用 ReadableStream 进行 NDJSON 渐进式流式响应
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const sendEvent = (obj) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        } catch { }
      };

      // 发送初始结构与进度声明
      sendEvent({
        type: 'start',
        totalRecords,
        totalPhotos,
      });

      // 3. 构建 ExcelJS 工作簿
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Sheet1');

      const headerRow = worksheet.addRow(DEMO_HEADERS);
      headerRow.height = 28;

      const colMap = {};
      headerRow.eachCell((cell, colNumber) => {
        const name = String(cell.value || '').trim();
        if (name) colMap[name] = colNumber;
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

      // 4. 并发池拉取 OSS 照片 (并发数 = 10)
      let processedPhotos = 0;
      const photoMap = new Map(); // key: `${recordIndex}_${colName}` -> buffer

      await asyncPool(10, photoTasks, async (task) => {
        const buf = await fetchAndProcessPhoto(task.photoKey, compressConfig);
        if (buf) {
          photoMap.set(`${task.recordIndex}_${task.colName}`, buf);
        }
        processedPhotos++;

        // 计算合并进度 (照片拉取占 70% 权重，Excel 单元格填充占 30% 权重)
        const photoPercent = totalPhotos > 0 ? (processedPhotos / totalPhotos) * 70 : 70;
        sendEvent({
          type: 'progress',
          currentRecord: 0,
          totalRecords,
          processedPhotos,
          totalPhotos,
          percent: Math.min(95, Math.round(photoPercent)),
          statusText: `正在并发下载云端照片 (${processedPhotos}/${totalPhotos})...`,
        });
      });

      // 5. 填入 Excel 行数据与单元格图像
      let currentRowIndex = 2;
      for (let i = 0; i < records.length; i++) {
        const r = records[i];
        const row = worksheet.getRow(currentRowIndex);
        row.height = 65;

        const hasAnyPhoto = !!(r.photo_zudui || r.photo_dadi || r.photo_gaimian);
        const hasRejected =
          (r.photo_zudui && r.photo_zudui.startsWith('REJECTED:')) ||
          (r.photo_dadi && r.photo_dadi.startsWith('REJECTED:')) ||
          (r.photo_gaimian && r.photo_gaimian.startsWith('REJECTED:'));

        let checkResult = '';
        if (hasAnyPhoto) {
          checkResult = hasRejected ? '不合格' : '合格';
        }

        if (colMap['序号']) row.getCell(colMap['序号']).value = i + 1;
        if (colMap['项目名称']) row.getCell(colMap['项目名称']).value = r.project_name || '';
        if (colMap['施工号']) row.getCell(colMap['施工号']).value = r.construction_no || '';
        if (colMap['管线号']) row.getCell(colMap['管线号']).value = r.pipeline_no || '';
        if (colMap['焊口号']) row.getCell(colMap['焊口号']).value = r.weld_no || '';
        if (colMap['检查结果']) row.getCell(colMap['检查结果']).value = checkResult;

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

        // 插入 3 工序单元格图片
        ['组对照片', '打底照片', '盖面照片'].forEach((colName) => {
          const colNum = colMap[colName];
          const imgBuffer = photoMap.get(`${i}_${colName}`);
          if (colNum && imgBuffer) {
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
              logger.warn({ msg: 'export.embed_image_error', recordIndex: i, colName, error: imgErr.message });
            }
          }
        });

        row.commit();
        currentRowIndex++;

        // 报告表格渲染进度 (占剩余 30% 权重)
        const rowPercent = 70 + ((i + 1) / totalRecords) * 28;
        sendEvent({
          type: 'progress',
          currentRecord: i + 1,
          totalRecords,
          processedPhotos,
          totalPhotos,
          percent: Math.min(99, Math.round(rowPercent)),
          statusText: `正在组装 Excel 表格数据 (${i + 1}/${totalRecords})...`,
        });
      }

      // 设置列宽
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

      // 6. 最终生成 Buffer 并以 Base64 输出完成指令
      const buffer = await workbook.xlsx.writeBuffer();
      const timestamp = getFormattedTimestamp();
      const rawFileName = `${project.project_name || '项目'}_管道焊接过程质量管理基本信息_${timestamp}.xlsx`;

      sendEvent({
        type: 'done',
        fileName: rawFileName,
        base64: buffer.toString('base64'),
      });

      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
    },
  });
}

export const POST = withTrace(handler);
