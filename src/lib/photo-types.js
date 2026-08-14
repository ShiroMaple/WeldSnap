/**
 * 工序单一真相源 (Single Source of Truth)
 *
 * 焊口照片工序定义。工序名称全局固定，key 用拼音小写，与数据库列名 `photo_{key}` 强绑定。
 * 新增工序步骤：
 *   1. 在下方 PHOTO_TYPES 追加一项 { key, label }；
 *   2. 在 src/lib/db.js 的迁移逻辑中 `ALTER TABLE weld_records ADD COLUMN photo_{key} TEXT`。
 *
 * CommonJS 模块：服务端 require 与客户端 import 均兼容（Next.js/webpack 处理）。
 */

const PHOTO_TYPES = [
  { key: 'neijie', label: '内洁' },
  { key: 'zudui', label: '组对' },
  { key: 'dadi', label: '打底' },
  { key: 'gaimian', label: '盖面' },
];

/** 默认启用的工序 keys（存量项目 / 建设单位无匹配时回退 3 道） */
const DEFAULT_PROCESS_KEYS = ['zudui', 'dadi', 'gaimian'];

/** key → 数据库列名 (photo_{key}) */
function getFieldName(key) {
  return `photo_${key}`;
}

/** key → 中文名；未知 key 原样返回 */
function getLabel(key) {
  const t = PHOTO_TYPES.find((x) => x.key === key);
  return t ? t.label : key;
}

/** key 是否为合法工序 */
function isValidKey(key) {
  return PHOTO_TYPES.some((x) => x.key === key);
}

/** 中文名 → key；未知返回 null */
function getKeyByLabel(label) {
  const t = PHOTO_TYPES.find((x) => x.label === label);
  return t ? t.key : null;
}

/**
 * 解析项目 processes JSON，兜底 NULL / 非法 → 默认 3 道。
 * 仅保留合法 key，并按 PHOTO_TYPES 全序排序保证顺序稳定。
 */
function parseProcessKeys(value) {
  if (!value) return [...DEFAULT_PROCESS_KEYS];
  try {
    const arr = JSON.parse(value);
    if (Array.isArray(arr)) {
      const valid = orderKeys(arr.filter((k) => isValidKey(k)));
      if (valid.length > 0) return valid;
    }
  } catch (e) {
    // 非法 JSON，走默认
  }
  return [...DEFAULT_PROCESS_KEYS];
}

/** 按 PHOTO_TYPES 全序排序 keys（勾选顺序稳定） */
function orderKeys(keys) {
  return PHOTO_TYPES.map((t) => t.key).filter((k) => keys.includes(k));
}

module.exports = {
  PHOTO_TYPES,
  DEFAULT_PROCESS_KEYS,
  getFieldName,
  getLabel,
  getKeyByLabel,
  isValidKey,
  parseProcessKeys,
  orderKeys,
};
