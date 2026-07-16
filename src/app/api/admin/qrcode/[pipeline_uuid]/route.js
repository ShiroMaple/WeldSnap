/**
 * 生成单个管线二维码接口 (基于全局唯一 UUID)
 * GET /api/admin/qrcode/[pipeline_uuid]
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const { getLocalIPs } = require('../../../../../lib/ip');
const db = require('../../../../../lib/db');
const QRCode = require('qrcode');

async function handler(request, { params }) {
  requireAdmin(request);

  const resolvedParams = await params;
  const pipelineUuid = decodeURIComponent(resolvedParams.pipeline_uuid);

  if (!pipelineUuid) {
    return Response.json({ success: false, error: '缺少管线 UUID 参数' }, { status: 400 });
  }

  // 查库校验管线是否存在
  const pipeline = db.getPipelineByUuid(pipelineUuid);
  if (!pipeline) {
    return Response.json({ success: false, error: '找不到该管线记录' }, { status: 404 });
  }

  // 1. 获取局域网 IP 与端口
  const ips = getLocalIPs();
  const ip = ips[0] || 'localhost';
  const port = process.env.PORT || 3000;

  // 2. 构造手机扫码端地址 (Next.js 路由 /upload?pipeline_uuid=...)
  const url = `http://${ip}:${port}/upload?pipeline_uuid=${pipelineUuid}`;

  // 3. 生成二维码 Base64
  let qrDataUrl;
  try {
    qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
  } catch (err) {
    return Response.json({ success: false, error: '二维码生成失败: ' + err.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    url,
    qr: qrDataUrl,
    pipeline_no: pipeline.pipeline_no,
  });
}

export const GET = withTrace(handler);
