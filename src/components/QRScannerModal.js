'use client';

import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';

/**
 * 移动端二维码实时摄像头扫描弹窗组件
 *
 * 特性：
 *   - 自动唤起后置摄像头进行实时识别
 *   - 支持识别包含 pipeline_uuid 的完整 URL 或纯 UUID 字符串
 *   - 支持从手机相册文件上传识别二维码
 *   - 遵循 IBM Carbon 工业硬朗大触控设计（52px+ 触控目标）
 */
export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  const [errorMsg, setErrorMsg] = useState('');
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    setErrorMsg('');
    setScanning(true);

    const html5Qrcode = new Html5Qrcode('qr-reader-region');
    scannerRef.current = html5Qrcode;

    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    html5Qrcode
      .start(
        { facingMode: 'environment' }, // 优先使用后置摄像头
        config,
        (decodedText) => {
          // 成功扫码
          handleQrResult(decodedText);
        },
        () => {
          // 逐帧扫描中的正常静默，忽略 error
        }
      )
      .catch((err) => {
        setErrorMsg('无法打开摄像头，请确保已授予摄像头权限，或尝试从相册选择二维码');
        setScanning(false);
      });

    return () => {
      if (scannerRef.current && scannerRef.current.isScanning) {
        scannerRef.current.stop().catch(() => {});
      }
    };
  }, [isOpen]);

  const handleQrResult = (decodedText) => {
    if (!decodedText) return;

    // 音效与震动提示（支持设备）
    if (navigator.vibrate) {
      try { navigator.vibrate(100); } catch {}
    }

    let pipelineUuid = decodedText.trim();

    // 尝试解析包含 URL 参数的情况
    try {
      if (pipelineUuid.includes('pipeline_uuid=')) {
        const urlObj = new URL(pipelineUuid.startsWith('http') ? pipelineUuid : `http://dummy.com/${pipelineUuid}`);
        const param = urlObj.searchParams.get('pipeline_uuid');
        if (param) pipelineUuid = param;
      }
    } catch {}

    // 停止摄像头
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
      const html5Qrcode = scannerRef.current || new Html5Qrcode('qr-reader-region');
      const result = await html5Qrcode.scanFile(file, true);
      handleQrResult(result);
    } catch (err) {
      setErrorMsg('未能在图片中识别出有效二维码，请重试');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-[#161616]/90 flex flex-col justify-between p-4 font-sans select-none">
      {/* 顶部标题栏 */}
      <div className="flex items-center justify-between text-white border-b border-[#393939] pb-3">
        <div>
          <h2 className="text-[16px] font-semibold">扫描二维码定位管线</h2>
          <span className="text-[11px] text-[#c6c6c6]">将管线二维码放入下方框内自动识别</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] rounded-none border-none cursor-pointer outline-none"
        >
          关闭
        </button>
      </div>

      {/* 实时视频/识别区 */}
      <div className="flex-1 flex flex-col items-center justify-center my-4 relative">
        <div id="qr-reader-region" className="w-full max-w-[320px] bg-black border border-[#525252]" />
        
        {errorMsg && (
          <div className="mt-4 p-3 bg-[#da1e28] text-white text-[13px] text-center max-w-[320px]">
            {errorMsg}
          </div>
        )}
      </div>

      {/* 底部按键区（52px+ 触控目标） */}
      <div className="space-y-3 pt-2">
        <input
          type="file"
          ref={fileInputRef}
          accept="image/*"
          onChange={handleFileScan}
          className="hidden"
        />
        
        <button
          type="button"
          onClick={() => fileInputRef.current && fileInputRef.current.click()}
          className="w-full h-13 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[14px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center justify-center"
        >
          🖼️ 从手机相册读取二维码照片
        </button>

        <button
          type="button"
          onClick={onClose}
          className="w-full h-13 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[14px] font-semibold cursor-pointer rounded-none border-none outline-none"
        >
          取消扫描并返回
        </button>
      </div>
    </div>
  );
}
