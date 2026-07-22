export const dynamic = 'force-dynamic';
/**
 * 致远 OA DEE 适配器项目同步接口
 * POST /api/sync/projects
 *
 * 支持：
 * 1. 批量 JSON 数组或单条 JSON 对象 (支持中文键与英文键)
 * 2. 批量 DEE XML document 输出推送 (<root><projectName><row>...</row></projectName></root>)
 *
 * 鉴权说明：在请求 Header 中携带 X-API-Key: weldsnap-dee-secret-key
 * 或在 URL Query 中携带 ?token=weldsnap-dee-secret-key
 */

const { withTrace } = require('../../../../middleware/withTrace');
const db = require('../../../../lib/db');
const { logger } = require('../../../../lib/logger');

const DEFAULT_SECRET_TOKEN = process.env.SYNC_API_KEY || 'weldsnap-dee-secret-key';

async function handler(request) {
  // 1. 验证 Token / API Key
  const authHeader = request.headers.get('x-api-key') || request.headers.get('authorization') || '';
  const { searchParams } = new URL(request.url);
  const queryToken = searchParams.get('token') || '';

  const providedKey = authHeader.replace(/^Bearer\s+/i, '').trim() || queryToken.trim();

  if (providedKey !== DEFAULT_SECRET_TOKEN) {
    logger.warn({ msg: 'sync.unauthorized', providedKey });
    return Response.json({ success: false, error: '鉴权失败，无效的 API Key / Token' }, { status: 401 });
  }

  // 2. 读取 Raw Request Body
  let rawText = '';
  try {
    rawText = await request.text();
  } catch (e) {
    return Response.json({ success: false, error: '无法读取请求 Body' }, { status: 400 });
  }

  if (!rawText || !rawText.trim()) {
    return Response.json({ success: false, error: '接收到的项目数据为空' }, { status: 400 });
  }

  let records = [];
  const contentType = request.headers.get('content-type') || '';

  // 判断是否为 XML 格式 (DEE 提取输出的 Document)
  if (contentType.includes('xml') || rawText.trim().startsWith('<')) {
    const rowMatches = rawText.match(/<row[\s\S]*?>[\s\S]*?<\/row>/gi) || [];
    records = rowMatches.map((rowXml) => {
      const getTag = (tag) => {
        const m = rowXml.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
        return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gi, '$1').trim() : '';
      };
      return {
        construction_no: getTag('施工号') || getTag('construction_no'),
        project_name: getTag('项目名称') || getTag('project_name'),
        owner_unit: getTag('建设单位') || getTag('owner_unit'),
        construction_unit: getTag('施工单位') || getTag('construction_unit'),
        completion_status: getTag('项目完工状态') || getTag('完工状态') || getTag('completion_status') || '进行中',
        remark: getTag('项目备注') || getTag('remark'),
        pipeline_prefix: getTag('管线号前缀') || getTag('pipeline_prefix'),
        weld_prefix: getTag('焊口号前缀') || getTag('weld_prefix'),
      };
    });
  } else {
    // JSON 解析 (支持单条或数组，支持中文及英文键)
    let body;
    try {
      body = JSON.parse(rawText);
    } catch (e) {
      return Response.json({ success: false, error: '请求 Body 格式错误，必须为合法 JSON 或 XML' }, { status: 400 });
    }

    const rawList = Array.isArray(body) ? body : [body];
    records = rawList.map((item) => ({
      construction_no: String(item.construction_no || item.施工号 || item.施工编号 || '').trim(),
      project_name: String(item.project_name || item.项目名称 || item.工程名称 || '').trim(),
      owner_unit: String(item.owner_unit || item.建设单位 || '').trim(),
      construction_unit: String(item.construction_unit || item.施工单位 || '').trim(),
      completion_status: String(item.completion_status || item.项目完工状态 || item.完工状态 || item.状态 || '').trim() || '进行中',
      remark: String(item.remark || item.项目备注 || item.备注 || '').trim(),
      pipeline_prefix: String(item.pipeline_prefix || item.管线号前缀 || item.管线前缀 || '').trim(),
      weld_prefix: String(item.weld_prefix || item.焊口号前缀 || item.焊口前缀 || '').trim(),
    }));
  }

  if (records.length === 0) {
    return Response.json({ success: false, error: '未能解析出任何有效的项目记录' }, { status: 400 });
  }

  // 3. 调用数据库批量插入/去重事务
  try {
    const result = db.importProjects(records);
    logger.info({ msg: 'sync.projects_success', ...result });

    return Response.json({
      success: true,
      message: `同步处理完成。解析 ${result.total} 条，成功写入 ${result.inserted} 条，跳过 ${result.skipped} 条。`,
      ...result,
    });
  } catch (err) {
    logger.error({ msg: 'sync.projects_failed', error: err.message });
    return Response.json({ success: false, error: '系统内部错误: ' + err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
