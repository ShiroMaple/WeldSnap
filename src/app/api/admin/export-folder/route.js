export const dynamic = 'force-dynamic';
/**
 * 获取云端归档目录树接口 (管理员权限)
 * GET /api/admin/export-folder
 *
 * 云原生改造：淘汰本地磁盘遍历，改为调用 OSS SDK 的 list() 列出桶下 projects/
 * 前缀的所有照片，并将扁平的文件列表自动聚合成层次目录树，无缝向下兼容。
 */

const { withTrace } = require('../../../../middleware/withTrace');
const { requireAdmin } = require('../../../../middleware/auth');
const { getOSSClient } = require('../../../../lib/oss');
const { getOSSConfig } = require('../../../../lib/env');

/**
 * 将扁平的 OSS Object List 构造成树状层次结构
 * @param {Array<{ name: string, size: number, lastModified: string }>} objects
 * @returns {Array<Record<string, any>>} 目录树
 */
function buildTreeFromObjects(objects) {
  const root = [];

  for (const obj of objects) {
    // 例如 name 为: projects/项目A_施工01/管线01/焊口01/管线01-焊口01-组对.jpg
    const parts = obj.name.split('/');
    if (parts.length < 2) continue; // 忽略不符合规范的根目录外文件

    // 我们过滤掉根前缀 'projects'，只从项目文件夹开始展示
    // 即从 parts[1] 开始往下层级构建
    let currentLevel = root;
    let accumulatedPath = parts[0];

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      accumulatedPath += '/' + part;
      const isFile = i === parts.length - 1;

      // 寻找当前层级是否已存在同名节点
      let existingNode = currentLevel.find(node => node.name === part);

      if (!existingNode) {
        if (isFile) {
          // 叶子节点：文件
          existingNode = {
            name: part,
            type: 'file',
            path: obj.name, // 保存完整的 Object Key 作为路径，供下载 API 使用
            size: obj.size,
            mtime: obj.lastModified,
          };
          currentLevel.push(existingNode);
        } else {
          // 中间节点：目录
          existingNode = {
            name: part,
            type: 'dir',
            path: accumulatedPath,
            children: [],
          };
          currentLevel.push(existingNode);
        }
      }

      // 如果是目录，继续深探
      if (!isFile) {
        currentLevel = existingNode.children;
      }
    }
  }

  return root;
}

async function handler(request) {
  requireAdmin(request);

  let client;
  let config;
  try {
    client = getOSSClient();
    config = getOSSConfig();
  } catch (err) {
    return Response.json({ success: false, error: 'OSS 客户端初始化失败，配置有误' }, { status: 500 });
  }

  // 1. 列出 OSS Bucket 中 'projects/' 前缀的所有文件
  let objects = [];
  try {
    let result = await client.list({
      prefix: 'projects/',
      'max-keys': 1000,
    });
    objects = result.objects || [];
  } catch (err) {
    return Response.json({ success: false, error: '获取云端文件列表失败: ' + err.message }, { status: 502 });
  }

  // 2. 将扁平列表转换为目录树
  const tree = buildTreeFromObjects(objects);

  return Response.json({
    success: true,
    tree,
    root: `OSS://${config.bucket}/projects`,
  });
}

export const GET = withTrace(handler);

