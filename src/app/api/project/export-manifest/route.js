/**
 * 批量下载清单生成接口 (需登录)
 * POST /api/project/export-manifest
 *
 * 接收 pipeline_uuids 或 weld_uuids 数组。
 * 遍历对应的所有有效照片记录，生成 OSS 限时签名 GET URL
 * 并结合业务字段拼装成语义化文件名，如：管线号-焊口号-工序.jpg
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { getOSSClient } = require('../../../../lib/oss');
const db = require('../../../../lib/db');

const TYPE_NAME_MAP = {
  zudui: '组对',
  dadi: '打底',
  gaimian: '盖面',
};

async function handler(request) {
  requireAuth(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ success: false, error: '请求体必须是 JSON' }, { status: 400 });
  }

  const { pipeline_uuids, weld_uuids } = body;

  let welds = [];

  try {
    if (weld_uuids && Array.isArray(weld_uuids) && weld_uuids.length > 0) {
      for (const uuid of weld_uuids) {
        const w = db.getWeldByUuid(uuid);
        if (w) welds.push(w);
      }
    } else if (pipeline_uuids && Array.isArray(pipeline_uuids) && pipeline_uuids.length > 0) {
      for (const pUuid of pipeline_uuids) {
        const pipeline = db.getPipelineByUuid(pUuid);
        if (pipeline) {
          const list = db.listWelds(pUuid);
          welds.push(...list);
        }
      }
    }

    if (welds.length === 0) {
      return Response.json({ success: true, manifest: [] });
    }

    const client = getOSSClient();
    const manifest = [];

    for (const w of welds) {
      const pNo = w.pipeline_no;
      const wNo = w.weld_no;

      const checkAndAdd = (field, typeKey) => {
        const val = w[field];
        if (val && !val.startsWith('REJECTED:')) {
          const typeName = TYPE_NAME_MAP[typeKey];
          const filename = `${pNo}-${wNo}-${typeName}.jpg`;
          
          // 生成限时一小时的 GET 签名预览/下载 URL
          const signedUrl = client.signatureUrl(val, {
            expires: 3600,
            method: 'GET',
          });

          manifest.push({
            url: signedUrl,
            filename,
          });
        }
      };

      checkAndAdd('photo_zudui', 'zudui');
      checkAndAdd('photo_dadi', 'dadi');
      checkAndAdd('photo_gaimian', 'gaimian');
    }

    return Response.json({ success: true, manifest });
  } catch (err) {
    return Response.json({ success: false, error: err.message }, { status: 500 });
  }
}

export const POST = withTrace(handler);
