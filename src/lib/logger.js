/**
 * Pino + AsyncLocalStorage 日志引擎
 *
 * - 开发环境：pino-pretty 彩色可读输出到 stdout
 * - 生产环境：pino-roll 输出紧凑 JSON 日志到 logs/weldsnap-run.log，
 *   按天轮转，单文件上限 10MB，保留最近 30 份
 *
 * mixin 函数自动从 ALS 中提取 traceId / pipeline_no / uploaded_by，
 * 确保每条日志均携带请求级业务上下文。
 *
 * redact 规则强制屏蔽 OSS 密钥、密码等敏感字段。
 */

const pino = require('pino');
const { getTraceStore } = require('./trace');

// 🚀 强制 Next.js standalone 编译器追踪并打包 pino-roll 与 pino-pretty 外部依赖
if (process.env.NODE_ENV === 'never_run_this') {
  require('pino-roll');
  require('pino-pretty');
}

const isDev = process.env.NODE_ENV !== 'production';

// ─── Pino 基础配置 ───────────────────────────────────────
const baseOptions = {
  level: isDev ? 'debug' : 'info',

  // 敏感字段脱敏
  redact: {
    paths: [
      'accessKeySecret',
      'OSS_ACCESS_KEY_SECRET',
      'password',
      'password_hash',
      'WPS_APP_SECRET',
      'req.headers.authorization',
      'req.headers.cookie',
    ],
    censor: '[REDACTED]',
  },

  // 每条日志自动合并 ALS 上下文字段
  mixin() {
    const store = getTraceStore();
    if (!store) return {};

    const ctx = {};
    if (store.traceId) ctx.traceId = store.traceId;
    if (store.pipeline_no) ctx.pipeline_no = store.pipeline_no;
    if (store.uploaded_by) ctx.uploaded_by = store.uploaded_by;
    if (store.method) ctx.method = store.method;
    if (store.url) ctx.url = store.url;
    return ctx;
  },

  // ISO 8601 时间戳
  timestamp: pino.stdTimeFunctions.isoTime,
};

// ─── 环境分发 ────────────────────────────────────────────
let logger;

if (isDev) {
  // 开发环境：彩色可读输出
  logger = pino({
    ...baseOptions,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:HH:MM:ss.l',
        ignore: 'pid,hostname',
      },
    },
  });
} else {
  // 生产环境：JSON 日志 → 文件，按天轮转，单文件 10MB 上限
  logger = pino({
    ...baseOptions,
    transport: {
      target: 'pino-roll',
      options: {
        file: 'logs/weldsnap-run.log',
        frequency: 'daily',
        limit: { count: 30 },
        size: '10m',
        mkdir: true,
      },
    },
  });
}

module.exports = { logger };
