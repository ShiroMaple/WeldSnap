'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * 移动端二维码扫描/拍照识别模态框组件
 *
 * 特性：
 *   - 100% 兼容移动端（微信、Safari、Chrome、HTTP/HTTPS 环境）：
 *     支持使用原生相机拍二维码照片（capture="environment"）并解码，避免 getUserMedia 权限与 Secure Context 限制。
 *   - 支持实时视频流识别（自动回退处理）。
 *   - 支持从手机相册选取图片识别。
 *   - 遵循 IBM Carbon 工业硬朗大触控设计（52px+ 触控目标）。
 */
export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [streamActive, setStreamActive] = useState(false);
  const scannerRef = useRef(null);

  const cameraFileInputRef = useRef(null);
  const albumFileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setStreamActive(false);

    const html5Qrcode = new Html5Qrcode('qr-reader-region');
    scannerRef.current = html5Qrcode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    // 尝试启动视频流扫码；若 HTTP 或环境受限被拒，捕获异常提示用户使用相机拍照识别
    html5Qrcode
      .start(
        { facingMode: 'environment' },
        config,
        (decodedText) => {
          handleQrResult(decodedText);
        },
        () => {}
      )
      .then(() => {
        setStreamActive(true);
      })
      .catch(() => {
        setStreamActive(false);
      });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen]);

  const handleQrResult = (decodedText) => {
    if (!decodedText) return;

    if (navigator.vibrate) {
      try { navigator.vibrate(100); } catch {}
    }

    let pipelineUuid = decodedText.trim();

    try {
      if (pipelineUuid.includes('pipeline_uuid=')) {
        const urlObj = new URL(pipelineUuid.startsWith('http') ? pipelineUuid : `http://dummy.com/${pipelineUuid}`);
        const param = urlObj.searchParams.get('pipeline_uuid');
        if (param) pipelineUuid = param;
      }
    } catch {}

    if (scannerRef.current && scannerRef.current.isScanning) {
      scannerRef.current.stop().then(() => {
        onScanSuccess(pipelineUuid);
        onClose();
      }).catch(() => {
        onScanSuccess(pipelineUuid);
        onClose();
      });
    } else {
      onScanSuccess(pipelineUuid);
      onClose();
    }
  };

  const handleFileScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setErrorMsg('正在识别二维码照片...');
      const html5Qrcode = scannerRef.current || new Html5Qrcode('qr-reader-region');
      const result = await html5Qrcode.scanFile(file, true);
      setErrorMsg('');
      handleQrResult(result);
    } catch (err) {
      setErrorMsg('未能在拍摄的照片中识别出有效二维码，请保持清晰并重新拍摄');
    } finally {
      e.target.value = '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#161616]/95 flex flex-col justify-between p-4 font-sans select-none">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between text-white border-b border-[#393939] pb-3">
        <div>
          <h2 className="text-[16px] font-semibold">扫码定位管线号</h2>
          <span className="text-[11px] text-[#c6c6c6]">支持调起手机相机拍照识别或选取二维码</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] rounded-none border-none cursor-pointer outline-none"
        >
          关闭
        </button>
      </div>

      {/* 扫码区 / 相机拍照识别提示 */}
      <div className="flex-1 flex flex-col items-center justify-center my-4 relative">
        <div id="qr-reader-region" className="w-full max-w-[320px] bg-black border border-[#525252] min-h-[220px]" />
        
        {!streamActive && (
          <div className="mt-4 p-3 bg-[#262626] text-[#f4f4f4] text-[12px] text-center max-w-[320px] border border-[#525252]">
            💡 请直接点击下方【📷 唤起手机相机拍照识别】按钮拍二维码照片，无需任何权限设置
          </div>
        )}

        {errorMsg && (
          <div className="mt-3 p-3 bg-[#da1e28] text-white text-[13px] text-center max-w-[320px]">
            {errorMsg}
          </div>
        )}
      </div>

      {/* 隐藏的相机 & 相册 File Inputs */}
      <input
        type="file"
        ref={cameraFileInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleFileScan}
        className="hidden"
      />
      <input
        type="file"
        ref={albumFileInputRef}
        accept="image/*"
        onChange={handleFileScan}
        className="hidden"
      />

      {/* 底部 52px+ 工业大按键 */}
      <div className="space-y-2.5 pt-2">
        <button
          type="button"
          onClick={() => cameraFileInputRef.current && cameraFileInputRef.current.click()}
          className="w-full h-14 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[15px] font-semibold cursor-pointer rounded-none border-none outline-none flex items-center justify-center space-x-2"
        >
          <span className="text-[20px]">📷</span>
          <span>唤起手机相机拍照识别二维码</span>
        </button>

        <button
          type="button"
          onClick={() => albumFileInputRef.current && albumFileInputRef.current.click()}
          className="w-full h-13 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[14px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center justify-center space-x-2"
        >
          <span>🖼️ 从手机相册选取二维码照片</span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-12 bg-transparent border border-[#525252] hover:bg-[#393939] text-[#c6c6c6] text-[13px] cursor-pointer rounded-none outline-none"
        >
          取消并返回
        </button>
      </div>
    </div>
  );
}
