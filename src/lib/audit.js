/**
 * 业务审计日志 (Audit Log) 封装模块
 * 
 * 记录带有强语义自然的业务操作日志 (Pino level: audit / 35)。
 * 自动提取当前 AsyncLocalStorage 中的操作者 (uploaded_by / user)，
 * 生成形如 `管理员 "系统管理员" 新建了项目 "炼化项目" (施工号: SG-01)` 的可读日志。
 */

const { logger } = require('./logger');
const { getTraceStore } = require('./trace');

/**
 * 记录业务审计日志
 * @param {string} action 业务动作代码 (如 'CREATE_PROJECT', 'UPLOAD_PHOTO')
 * @param {string} description 动作的自然语言描述 (如 '新建了项目 "炼化一期" (施工号: SG-888)')
 * @param {object} [details] 附加的结构化业务属性
 */
function logAudit(action, description, details = {}) {
  const store = getTraceStore();
  const operator = store?.uploaded_by || '系统';

  const formattedMsg = `${operator} ${description}`;

  logger.audit(
    {
      type: 'audit',
      action,
      ...details,
    },
    formattedMsg
  );
}

module.exports = { logAudit };
