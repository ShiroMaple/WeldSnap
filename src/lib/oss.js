/**
 * 阿里云 OSS 客户端单例
 *
 * 从 env.js 读取凭证配置，懒加载创建并缓存 ali-oss Client 实例。
 * 整个进程生命周期仅创建一次 OSS 连接。
 */

const OSS = require('ali-oss');
const { getOSSConfig } = require('./env');

/** @type {OSS | null} */
let client = null;

/**
 * 获取 OSS 客户端实例（懒加载单例）
 * @returns {OSS}
 */
function getOSSClient() {
  if (!client) {
    const config = getOSSConfig();
    client = new OSS({
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      bucket: config.bucket,
      region: config.region,
      endpoint: config.endpoint,
    });
  }
  return client;
}

module.exports = { getOSSClient };
