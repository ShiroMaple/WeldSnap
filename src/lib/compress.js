/**
 * 前端 Canvas 图片就地压缩引擎 (Client-side helper)
 *
 * 职责：
 *   在手机端拍照完成后，拦截原始文件流进行 Canvas 重采样。
 *   等比降维至上限 1920x1080，并压缩 JPEG 质量至 0.8。
 *   可将 5-10MB 的手机高清大图就地缩减至 150-450KB 以内，极大优化局域网上传体验。
 */

/**
 * 客户端压缩 JPEG 图片
 * @param {File} file - 原始拍照 File 文件对象
 * @param {number} maxWidth - 最大宽度限制 (默认 1920)
 * @param {number} maxHeight - 最大高度限制 (默认 1080)
 * @param {number} quality - 压缩质量系数 (默认 0.8)
 * @returns {Promise<Blob>} 压缩后的 Blob 对象
 */
export function compressImage(file, maxWidth = 1920, maxHeight = 1080, quality = 0.8) {
  return new Promise((resolve, reject) => {
    // 确保仅在浏览器环境下执行
    if (typeof window === 'undefined') {
      return reject(new Error('compressImage can only be used in browser environment.'));
    }

    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 1. 等比缩放计算
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 2. 建立 Canvas 画布并重绘
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          return reject(new Error('Failed to get 2d context for image compression.'));
        }

        ctx.drawImage(img, 0, 0, width, height);

        // 3. 导出 JPEG Blob
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              reject(new Error('Canvas export returned null.'));
            }
          },
          'image/jpeg',
          quality
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}
