/**
 * 上传业务服务层 (项目拓扑扁平存储重构版)
 *
 * 封装 OSS 预签名 URL 生成和上传状态回写的核心业务逻辑。
 * 直传云端 OSS 时的 Object Key 统一强制平摊化命名为：
 *   projects/{project_uuid}/{weld_uuid}_{工序名称}.jpg
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
 * 生成 OSS 预签名上传 URL (扁平化命名)
 * @param {string} weldUuid - 焊口 UUID
 * @param {string} photoType - 工序类型 (zudui | dadi | gaimian)
 * @returns {{ signedUrl: string, objectKey: string, expiresIn: number }}
 */
function generatePresignedUrl(weldUuid, photoType) {
  // 1. 校验 photoType
  const typeName = PHOTO_TYPE_MAP[photoType];
  if (!typeName) {
    throw new Error(`无效的照片类型: ${photoType}`);
  }

  // 2. 查库验证焊口记录
  const weld = db.getWeldByUuid(weldUuid);
  if (!weld) {
    throw new Error(`焊口记录不存在: ${weldUuid}`);
  }

  // 3. 构建 Object Key (扁平去语义化结构)
  const objectKey = `projects/${weld.project_uuid}/${weld.uuid}_${typeName}.jpg`;

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
 * @param {string} weldUuid - 焊口 UUID
 * @param {string} photoType - 工序类型 (zudui | dadi | gaimian)
 * @param {string} objectKey - OSS Object Key 路径
 * @param {string} uploadedBy - 上传人显示名
 */
function confirmUpload(weldUuid, photoType, objectKey, uploadedBy) {
  const field = FIELD_MAP[photoType];
  if (!field) {
    throw new Error(`无效的照片类型: ${photoType}`);
  }

  const weld = db.getWeldByUuid(weldUuid);
  if (!weld) {
    throw new Error(`焊口记录不存在: ${weldUuid}`);
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
