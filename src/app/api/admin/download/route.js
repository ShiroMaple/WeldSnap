/**
 * 云端归档照片下载接口 (管理员权限)
 * GET /api/admin/download?path=objectKey
 *
 * 云原生重构逻辑：
 * 管理员点击下载文件时，向 OSS SDK 请求生成一个带有签名的、限时 60 秒有效的
 * 预签名 GET 下载 URL。服务端直接返回 HTTP 302 临时重定向引导浏览器到该 URL 下载，
 * 既保障了数据安全性，又免去了 Next.js 服务器中转大文件流的内存与带宽开销。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const { getOSSClient } = require('../../../../lib/oss');

async function handler(request) {
  requireAdmin(request);

  const { searchParams } = new URL(request.url);
  const objectKey = searchParams.get('path');

  if (!objectKey) {
    return Response.json({ success: false, error: '缺少 path 参数' }, { status: 400 });
  }

  // 简单安全校验：防止路径跨越到 projects/ 目录之外
  if (!objectKey.startsWith('projects/')) {
    return Response.json({ success: false, error: '非法路径，无权访问' }, { status: 403 });
  }

  let downloadUrl;
  try {
    const client = getOSSClient();
    // 生成 GET 预签名下载链接，设置 response header 促使浏览器弹出下载框
    const filename = objectKey.split('/').pop();
    downloadUrl = client.signatureUrl(objectKey, {
      expires: 60, // 60 秒有效期
      method: 'GET',
      response: {
        'content-disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (err) {
    return Response.json({ success: false, error: '生成下载签名失败: ' + err.message }, { status: 500 });
  }

  // 302 重定向至云端安全下载地址
  return Response.redirect(downloadUrl, 302);
}

export const GET = withTrace(handler);

