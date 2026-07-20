'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QrScanner from 'qr-scanner';

/**
 * 移动端实时二维码解算组件 (基于 qr-scanner Web Worker 架构)
 *
 * 特性：
 *   - 使用 Web Worker 进行后台帧解算，确保 UI 线程流畅不卡顿
 *   - 中央 60% 区域 ROI 限制解算，降低 CPU 与功耗
 *   - 正则自动校验 WeldSnap UUID 链接/字符串
 *   - 防重复触发锁与硬件震动正反馈
 *   - 补光灯/手电筒开闭控制
 */
export function RealtimeQRScanner({ onMatchedUuid, onClose }) {
  const router = useRouter();
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const isNavigating = useRef(false);

  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [cameraError, setCameraError] = useState('');

  useEffect(() => {
    if (!videoRef.current) return;

    isNavigating.current = false;
    setCameraError('');

    const qrScanner = new QrScanner(
      videoRef.current,
      (result) => {
        if (isNavigating.current) return;

        const text = result?.data || (typeof result === 'string' ? result : '');
        if (!text) return;

        // 正则提取 UUID 模式（支持 URL 路径 /m/weld/UUID、?pipeline_uuid=UUID 或纯 UUID 字符串）
        const match =
          text.match(/\/m\/weld\/([a-f0-9-]{36})/i) ||
          text.match(/pipeline_uuid=([a-f0-9-]{36})/i) ||
          text.match(/^([a-f0-9-]{36})$/i);

        if (match) {
          const matchedUuid = match[1] || match[0];
          isNavigating.current = true;

          // 1. 立即停止扫描，防止连续触发
          try {
            qrScanner.stop();
          } catch {}

          // 2. 触发系统震动硬件反馈
          if (typeof window !== 'undefined' && 'vibrate' in navigator) {
            try {
              navigator.vibrate(150);
            } catch {}
          }

          // 3. 执行匹配成功逻辑
          if (onMatchedUuid) {
            onMatchedUuid(matchedUuid);
          } else {
            router.push(`/m/weld/${matchedUuid}`);
          }
        }
      },
      {
        highlightScanRegion: true,
        highlightCodeOutline: true,
        returnDetailedScanResult: true,
        maxScansPerSecond: 15, // 15 fps 帧率解算，兼顾性能与功耗
        calculateScanRegion: (video) => {
          // 限制仅识别中央 60% 区域 ROI
          const factor = 0.6;
          const width = video.videoWidth * factor;
          const height = video.videoHeight * factor;
          const x = (video.videoWidth - width) / 2;
          const y = (video.videoHeight - height) / 2;
          return { x, y, width, height };
        },
      }
    );

    scannerRef.current = qrScanner;

    qrScanner
      .start()
      .then(() => {
        QrScanner.hasFlash().then(setHasFlash).catch(() => setHasFlash(false));
      })
      .catch((err) => {
        setCameraError('无法打开摄像头，请确保已授予摄像头访问权限并在 HTTPS/localhost 下使用');
      });

    return () => {
      try {
        qrScanner.stop();
        qrScanner.destroy();
      } catch {}
    };
  }, [router, onMatchedUuid]);

  const toggleFlash = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.toggleFlash();
        setIsFlashOn(scannerRef.current.isFlashOn());
      } catch {}
    }
  };

  return (
    <div className="relative w-full h-full min-h-[420px] bg-black overflow-hidden flex flex-col justify-between select-none">
      {/* 视频渲染层 */}
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />

      {/* 遮罩与扫码框 (ROI Mask) */}
      <div className="absolute inset-0 z-10 flex flex-col items-center justify-between p-4 pointer-events-none">
        {/* 顶部控制栏 */}
        <div className="w-full flex items-center justify-between text-white pointer-events-auto">
          <div className="bg-black/60 px-3 py-1.5 backdrop-blur-md border border-white/20 text-[13px] font-medium">
            📷 扫码定位管线号
          </div>

          <div className="flex items-center space-x-2">
            {hasFlash && (
              <button
                type="button"
                onClick={toggleFlash}
                className="h-10 px-3 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[13px] font-medium border border-white/20 cursor-pointer outline-none"
              >
                {isFlashOn ? '💡 关灯' : '🔦 开灯'}
              </button>
            )}

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="h-10 px-3 bg-[#da1e28] hover:bg-[#b21922] text-white text-[13px] font-medium border-none cursor-pointer outline-none"
              >
                关闭
              </button>
            )}
          </div>
        </div>

        {/* 中央扫码框与镂空视觉 */}
        <div className="relative w-[260px] h-[260px] border-2 border-[#0f62fe] shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
          {/* 四角边框高亮 */}
          <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-[#0f62fe]" />
          <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-[#0f62fe]" />
          <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-[#0f62fe]" />
          <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-[#0f62fe]" />

          {/* 绿/蓝激光扫描线动画 */}
          <div className="w-full h-1 bg-[#0f62fe] shadow-[0_0_8px_#0f62fe] animate-pulse absolute top-1/2 -translate-y-1/2" />
        </div>

        {/* 底部提示文字 */}
        <div className="w-full text-center pb-2 pointer-events-auto">
          {cameraError ? (
            <div className="bg-[#da1e28] text-white p-3 text-[13px] inline-block max-w-[320px]">
              {cameraError}
            </div>
          ) : (
            <div className="bg-black/60 px-4 py-2 text-white/90 text-[12px] font-mono inline-block backdrop-blur-md border border-white/20">
              将管线二维码对准中央框框，识别成功将自动锁定
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RealtimeQRScanner;
