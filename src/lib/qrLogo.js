/**
 * 在二维码 Data URL 正中央合成 /logo_zpje.jpg Logo 图片
 * @param {string} qrDataUrl - 原始 QR 二维码 Base64 Data URL
 * @param {string} logoSrc - Logo 图片路径，默认 '/logo_zpje.jpg'
 * @returns {Promise<string>} 合成中心 Logo 后的 PNG Base64 Data URL
 */
export function addLogoToQRCode(qrDataUrl, logoSrc = '/logo_zpje.jpg') {
  if (typeof window === 'undefined' || !qrDataUrl) return Promise.resolve(qrDataUrl);

  return new Promise((resolve) => {
    const qrImg = new Image();
    qrImg.crossOrigin = 'anonymous';
    qrImg.src = qrDataUrl;

    qrImg.onload = () => {
      const canvas = document.createElement('canvas');
      const width = qrImg.width || 300;
      const height = qrImg.height || 300;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');

      // 1. 绘制底层二维码
      ctx.drawImage(qrImg, 0, 0, width, height);

      // 2. 加载并叠加中央 Logo
      const logoImg = new Image();
      logoImg.crossOrigin = 'anonymous';
      logoImg.src = logoSrc;

      logoImg.onload = () => {
        // Logo 尺寸占二维码总宽度的 ~22%
        const logoSize = Math.floor(width * 0.22);
        const x = Math.floor((width - logoSize) / 2);
        const y = Math.floor((height - logoSize) / 2);
        const border = Math.max(2, Math.floor(logoSize * 0.08));

        // 绘制白色垫底背景框，防止二维码黑色码点掩盖 Logo
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - border, y - border, logoSize + border * 2, logoSize + border * 2);

        // 绘制 Logo
        ctx.drawImage(logoImg, x, y, logoSize, logoSize);
        resolve(canvas.toDataURL('image/png'));
      };

      logoImg.onerror = () => {
        resolve(qrDataUrl);
      };
    };

    qrImg.onerror = () => {
      resolve(qrDataUrl);
    };
  });
}
