export const dynamic = 'force-dynamic';
/**
 * 照片安全预览重定向接口 (普通工人与管理员均可访问，需已登录)
 * GET /api/photo/preview?path=relative_path
 *
 * 接口接收 OSS 中的相对路径（Object Key），校验权限后直接生成带签名的限时 60 秒 GET 预览 URL，
 * 返回 HTTP 302 临时重定向，客户端 <img src="..."> 可完美无感渲染。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAuth } = require('../../../../middleware/auth');
const { getOSSClient } = require('../../../../lib/oss');

async function handler(request) {
  // 必须登录才能预览照片
  requireAuth(request);

  const { searchParams } = new URL(request.url);
  let objectKey = searchParams.get('path');

  if (!objectKey) {
    return Response.json({ success: false, error: '缺少 path 参数' }, { status: 400 });
  }

  // 如果带有 REJECTED: 前缀，将其剥离以获取真实的 OSS 路径
  if (objectKey.startsWith('REJECTED:')) {
    objectKey = objectKey.substring(9);
  }

  // 安全检查：防止访问 projects/ 目录之外的数据
  if (!objectKey.startsWith('projects/')) {
    return Response.json({ success: false, error: '非法路径，无权访问' }, { status: 403 });
  }

  let previewUrl;
  try {
    const client = getOSSClient();
    // 生成 GET 短效预签名预览 URL
    previewUrl = client.signatureUrl(objectKey, {
      expires: 60, // 60 秒有效期
      method: 'GET',
    });
  } catch (err) {
    return Response.json({ success: false, error: '生成预览授权失败: ' + err.message }, { status: 500 });
  }

  // 302 临时重定向至 OSS 签名预览地址
  return Response.redirect(previewUrl, 302);
}

export const GET = withTrace(handler);

