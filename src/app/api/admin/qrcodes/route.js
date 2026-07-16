/**
 * 获取批量打印管线二维码数据接口 (基于 UUID 与项目联动)
 * GET /api/admin/qrcodes?project_uuid=...&uuids=...
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const { getLocalIPs } = require('../../../../lib/ip');
const db = require('../../../../lib/db');
const QRCode = require('qrcode');

async function handler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const projectUuid = searchParams.get('project_uuid');
  const uuidsParam = searchParams.get('uuids'); // 逗号分隔的管线 UUID 列表

  let pipelines = [];

  if (uuidsParam) {
    const list = uuidsParam.split(',');
    for (const uuid of list) {
      const p = db.getPipelineByUuid(uuid);
      if (p) pipelines.push(p);
    }
  } else if (projectUuid) {
    // 默认获取该项目下的全量管线
    pipelines = db.listPipelines(projectUuid);
  } else {
    return Response.json({ success: false, error: '缺少 project_uuid 或 uuids 参数' }, { status: 400 });
  }

  // 获取局域网 IP 与端口
  const ips = getLocalIPs();
  const ip = ips[0] || 'localhost';
  const port = process.env.PORT || 3000;

  const items = [];
  try {
    for (const p of pipelines) {
      const url = `http://${ip}:${port}/upload?pipeline_uuid=${p.uuid}`;
      const qr = await QRCode.toDataURL(url, { width: 250, margin: 1 });
      items.push({
        pipeline_no: p.pipeline_no,
        url,
        qr,
      });
    }
  } catch (err) {
    return Response.json({ success: false, error: '批量生成二维码失败: ' + err.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    items,
    serverIP: ip,
    port,
  });
}

export const GET = withTrace(handler);
