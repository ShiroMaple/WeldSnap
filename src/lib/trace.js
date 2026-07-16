/**
 * AsyncLocalStorage 上下文存取工具
 *
 * 提供请求级隔离的 traceId 和业务上下文追踪。
 * 每个 HTTP 请求在独立的 ALS 隔离舱中运行，互不干扰。
 */

const { AsyncLocalStorage } = require('node:async_hooks');

/** @type {AsyncLocalStorage<Map<string, any>>} */
const als = new AsyncLocalStorage();

/**
 * 在指定上下文中执行异步函数
 *
 * @param {Record<string, any>} initialStore - 初始上下文字段（如 traceId, method, url）
 * @param {() => Promise<any>} fn - 要在隔离舱中执行的异步函数
 * @returns {Promise<any>}
 */
function runWithTrace(initialStore, fn) {
  const store = new Map(Object.entries(initialStore));
  return als.run(store, fn);
}

/**
 * 从当前 ALS 隔离舱中读取完整上下文对象
 *
 * @returns {Record<string, any> | null} 上下文字段键值对，无隔离舱时返回 null
 */
function getTraceStore() {
  const store = als.getStore();
  if (!store) return null;
  return Object.fromEntries(store);
}

/**
 * 动态追加业务字段到当前 ALS Store
 *
 * 用于在路由处理过程中逐步丰富日志上下文，
 * 例如在解析请求体后追加 pipeline_no。
 *
 * @param {string} key - 字段名
 * @param {any} value - 字段值
 */
function setTraceField(key, value) {
  const store = als.getStore();
  if (store) {
    store.set(key, value);
  }
}

module.exports = { runWithTrace, getTraceStore, setTraceField };
