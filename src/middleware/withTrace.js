/**
 * 高阶路由包装器：为 Next.js Route Handler 注入全链路追踪
 *
 * 使用方式：
 *   export const POST = withTrace(async (request) => { ... });
 *
 * 自动完成：
 *   1. 生成 crypto.randomUUID() 作为 traceId
 *   2. 初始化 ALS 隔离舱（traceId, method, url）
 *   3. 入口处记录 request.start 日志
 *   4. 出口处记录 request.end 日志（含 status + durationMs）
 *   5. 异常时记录 request.error 并返回 500 JSON 响应
 *   6. 在响应头中注入 X-Trace-Id 以支持前端调试
 */

const crypto = require('node:crypto');
const { runWithTrace } = require('../lib/trace');
const { logger } = require('../lib/logger');

/**
 * @param {(request: Request, context?: any) => Promise<Response>} handler
 * @returns {(request: Request, context?: any) => Promise<Response>}
 */
function withTrace(handler) {
  return async (request, context) => {
    const traceId = crypto.randomUUID();
    const startTime = performance.now();

    const initialStore = {
      traceId,
      method: request.method,
      url: request.url,
    };

    return runWithTrace(initialStore, async () => {
      logger.info({ msg: 'request.start' });

      try {
        const response = await handler(request, context);
        const durationMs = Math.round(performance.now() - startTime);

        logger.info({
          msg: 'request.end',
          status: response.status,
          durationMs,
        });

        // 在响应头中注入 traceId
        const headers = new Headers(response.headers);
        headers.set('X-Trace-Id', traceId);

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers,
        });
      } catch (err) {
        const durationMs = Math.round(performance.now() - startTime);

        // 如果是已知的业务级异常（带有 4xx 状态码），记录为 warn 而不是 error
        const isClientError = err.status >= 400 && err.status < 500;
        if (isClientError) {
          logger.warn({
            msg: 'request.client_error',
            error: err.message,
            status: err.status,
            durationMs,
          });
        } else {
          logger.error({
            msg: 'request.error',
            err: err.message,
            stack: err.stack,
            durationMs,
          });
        }

        const statusCode = err.status || 500;
        const errorMsg = isClientError ? err.message : '服务器内部错误';

        return Response.json(
          { success: false, error: errorMsg, traceId },
          {
            status: statusCode,
            headers: { 'X-Trace-Id': traceId },
          }
        );
      }
    });
  };
}

module.exports = { withTrace };
