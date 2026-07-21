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
const path = require('path');
const { getTraceStore } = require('./trace');

// 🚀 强制 Next.js standalone 编译器追踪并打包 pino-roll 与 pino-pretty 外部依赖（及其子依赖如 sonic-boom）
if (Math.random() < -1) {
  require('pino-roll');
  require('pino-pretty');
  require('sonic-boom');
}

const isDev = process.env.NODE_ENV !== 'production';

// ─── 东八区 (GMT+8) 时间戳格式化函数 ──────────────────────
function getCstIsoTime() {
  const now = new Date();
  const cstTime = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  const iso = cstTime.toISOString();
  return `, "time":"${iso.substring(0, 23)}+08:00"`;
}

// ─── Pino 基础配置 ───────────────────────────────────────
const baseOptions = {
  level: isDev ? 'debug' : 'info',
  customLevels: { audit: 35 },

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

  // 强制使用 GMT+8 ISO 时间戳
  timestamp: getCstIsoTime,
};

// ─── 环境分发与多目标 Transport ───────────────────────────
const targets = [];

if (isDev) {
  // 开发模式下在终端显示彩色日志
  targets.push({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname',
    },
  });
}

// 统一保存 NDJSON JSON 行日志文件用于“系统日志”前端分析与轮转导出
const logFilePath = path.resolve(process.cwd(), 'logs', 'weldsnap-run.log');

targets.push({
  target: 'pino-roll',
  options: {
    file: logFilePath,
    frequency: 'daily',
    limit: { count: 30 },
    size: '10m',
    mkdir: true,
  },
});

const logger = pino({
  ...baseOptions,
  transport: { targets },
});

// ─── 动态日志级别控制 ────────────────────────────────────
function setLogLevel(newLevel) {
  const VALID_LEVELS = ['trace', 'debug', 'info', 'audit', 'warn', 'error', 'fatal'];
  if (VALID_LEVELS.includes(newLevel)) {
    logger.level = newLevel;
    return true;
  }
  return false;
}

function getLogLevel() {
  return logger.level;
}

module.exports = { logger, setLogLevel, getLogLevel };
