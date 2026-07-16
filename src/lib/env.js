/**
 * 环境变量集中校验与导出
 *
 * 启动时一次性校验所有必需环境变量，缺失时抛出明确的启动错误，
 * 避免运行时才发现配置缺失。
 */

const REQUIRED_OSS_VARS = [
  'OSS_ACCESS_KEY_ID',
  'OSS_ACCESS_KEY_SECRET',
  'OSS_BUCKET',
  'OSS_REGION',
  'OSS_ENDPOINT',
];

let validated = false;

/**
 * 校验所有必需的 OSS 环境变量是否已配置
 * @throws {Error} 缺少环境变量时抛出明确错误
 */
function ensureEnv() {
  if (validated) return;

  const missing = REQUIRED_OSS_VARS.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(
      `[env] 缺少必需的环境变量: ${missing.join(', ')}。` +
        `请将 .env.example 复制为 .env.local 并填入真实凭证。`
    );
  }

  validated = true;
}

/**
 * 获取 OSS 配置对象（校验后）
 * @returns {{ accessKeyId: string, accessKeySecret: string, bucket: string, region: string, endpoint: string }}
 */
function getOSSConfig() {
  ensureEnv();
  return {
    accessKeyId: process.env.OSS_ACCESS_KEY_ID,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
    bucket: process.env.OSS_BUCKET,
    region: process.env.OSS_REGION,
    endpoint: process.env.OSS_ENDPOINT,
  };
}

/**
 * 获取 Session 密钥（开发环境允许使用默认值）
 * @returns {string}
 */
function getSessionSecret() {
  return process.env.SESSION_SECRET || 'weldsnap-dev-secret-change-me';
}

module.exports = { ensureEnv, getOSSConfig, getSessionSecret };
