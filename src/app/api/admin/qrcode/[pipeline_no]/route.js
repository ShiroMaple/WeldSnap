/**
 * 生成单个管线二维码接口
 * GET /api/admin/qrcode/[pipeline_no]
 */

const { withTrace } = require('../../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../../middleware/auth');
const { getLocalIPs } = require('../../../../../lib/ip');
const QRCode = require('qrcode');

async function handler(request, { params }) {
  requireAdmin(request);

  const resolvedParams = await params;
  const pipelineNo = decodeURIComponent(resolvedParams.pipeline_no);

  if (!pipelineNo) {
    return Response.json({ success: false, error: '缺少管线号参数' }, { status: 400 });
  }

  // 1. 获取局域网 IP 与端口
  const ips = getLocalIPs();
  const ip = ips[0] || 'localhost';
  const port = process.env.PORT || 3000;

  // 2. 构造手机扫码端地址 (Next.js 路由 /upload?pipeline=...)
  const url = `http://${ip}:${port}/upload?pipeline=${encodeURIComponent(pipelineNo)}`;

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
  });
}

export const GET = withTrace(handler);

