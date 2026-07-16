/**
 * 获取全部管线二维码接口 (打印页数据)
 * GET /api/admin/qrcodes
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const { getLocalIPs } = require('../../../../lib/ip');
const db = require('../../../../lib/db');
const QRCode = require('qrcode');

async function handler(request) {
  requireAdmin(request);

  // 1. 获取所有管线数据
  const pipelines = db.getAllPipelines();

  // 2. 获取局域网 IP 与端口
  const ips = getLocalIPs();
  const ip = ips[0] || 'localhost';
  const port = process.env.PORT || 3000;

  const items = [];
  try {
    for (const p of pipelines) {
      const url = `http://${ip}:${port}/upload?pipeline=${encodeURIComponent(p.pipeline_no)}`;
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

