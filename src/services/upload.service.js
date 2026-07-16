/**
 * 上传业务服务层
 *
 * 封装 OSS 预签名 URL 生成和上传状态回写的核心业务逻辑。
 * 与路由层解耦，便于复用和测试。
 */

const { getOSSClient } = require('../lib/oss');
const { logger } = require('../lib/logger');
const db = require('../lib/db');

/**
 * 照片工序类型 → 中文名映射
 */
const PHOTO_TYPE_MAP = {
  zudui: '组对',
  dadi: '打底',
  gaimian: '盖面',
};

/**
 * 照片工序类型 → 数据库字段映射
 */
const FIELD_MAP = {
  zudui: 'photo_zudui',
  dadi: 'photo_dadi',
  gaimian: 'photo_gaimian',
};

/**
 * 清理文件名中的非法字符
 * @param {string} name
 * @returns {string}
 */
function sanitizeFilename(name) {
  return String(name || '')
    .replace(/[\/\\:*?"<>|]/g, '_')
    .trim();
}

/**
 * 生成 OSS 预签名上传 URL
 *
 * 流程：
 *   1. 校验 photoType 合法性
 *   2. 查库确认 (pipeline_no, weld_no) 记录存在
 *   3. 根据项目元数据构建 Object Key 路径
 *   4. 调用 ali-oss signatureUrl 生成 60 秒有效的 PUT 预签名 URL
 *
 * @param {string} pipelineNo - 管线号
 * @param {string} weldNo - 焊口号
 * @param {string} photoType - 工序类型 (zudui | dadi | gaimian)
 * @returns {{ signedUrl: string, objectKey: string, expiresIn: number }}
 */
function generatePresignedUrl(pipelineNo, weldNo, photoType) {
  // 1. 校验 photoType
  const typeName = PHOTO_TYPE_MAP[photoType];
  if (!typeName) {
    throw new Error(`无效的照片类型: ${photoType}`);
  }

  // 2. 查库验证焊口记录
  const weld = db.getWeldByPipelineAndWeldNo(pipelineNo, weldNo);
  if (!weld) {
    throw new Error(`焊口记录不存在: ${pipelineNo} / ${weldNo}`);
  }

  // 3. 构建 Object Key
  // 路径规则：projects/{project_name}_{construction_no}/{pipeline_no}/{weld_no}/{pipeline_no}-{weld_no}-{工序名称}.jpg
  const projectFolder = `${sanitizeFilename(weld.project_name)}_${sanitizeFilename(weld.construction_no)}`;
  const pipelineFolder = sanitizeFilename(pipelineNo);
  const weldFolder = sanitizeFilename(weldNo);
  const fileName = `${pipelineFolder}-${weldFolder}-${typeName}.jpg`;

  const objectKey = `projects/${projectFolder}/${pipelineFolder}/${weldFolder}/${fileName}`;

  // 4. 生成预签名 URL
  const client = getOSSClient();
  const expiresIn = 60; // 60 秒有效期

  const signedUrl = client.signatureUrl(objectKey, {
    expires: expiresIn,
    method: 'PUT',
    'Content-Type': 'image/jpeg',
  });

  logger.info({ msg: 'oss.sign.generated', objectKey, expiresIn });

  return { signedUrl, objectKey, expiresIn };
}

/**
 * 确认上传完成：将 Object Key 写入数据库对应照片字段
 *
 * 客户端直传 OSS 成功后调用此函数，仅写入一个轻量字符串路径。
 *
 * @param {string} pipelineNo - 管线号
 * @param {string} weldNo - 焊口号
 * @param {string} photoType - 工序类型 (zudui | dadi | gaimian)
 * @param {string} objectKey - OSS Object Key 路径
 * @param {string} uploadedBy - 上传人显示名
 */
function confirmUpload(pipelineNo, weldNo, photoType, objectKey, uploadedBy) {
  const field = FIELD_MAP[photoType];
  if (!field) {
    throw new Error(`无效的照片类型: ${photoType}`);
  }

  const weld = db.getWeldByPipelineAndWeldNo(pipelineNo, weldNo);
  if (!weld) {
    throw new Error(`焊口记录不存在: ${pipelineNo} / ${weldNo}`);
  }

  db.updatePhotoPath(weld.id, field, objectKey, uploadedBy);
  logger.info({ msg: 'upload.confirmed', objectKey, field, uploadedBy });
}

module.exports = {
  generatePresignedUrl,
  confirmUpload,
  PHOTO_TYPE_MAP,
  FIELD_MAP,
};
