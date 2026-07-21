'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import QrScanner from 'qr-scanner';

/**
 * 移动端二维码解算组件 (基于 qr-scanner Web Worker 架构)
 *
 * 特性：
 *   1. 双重即时正反馈：Web Audio 800Hz 响亮提示音（100% 兼容 iOS/Android/微信）+ 硬件震动。
 *   2. 视觉识别成功状态：框体变为绿色 (#24a148)，显示 ✅ 识别成功 动态徽章与提示气泡。
 *   3. 延迟 350ms 顺畅跳转：兼顾视觉确认体验与无感定位。
 *   4. 单一精致 Carbon 蓝框 + 手电筒常驻 + 原生相机拍照降级。
 */
export function RealtimeQRScanner({ onMatchedUuid, onClose }) {
  const router = useRouter();
  const videoRef = useRef(null);
  const scannerRef = useRef(null);
  const cameraFileInputRef = useRef(null);
  const albumFileInputRef = useRef(null);

  const isNavigating = useRef(false);
  const [hasFlash, setHasFlash] = useState(false);
  const [isFlashOn, setIsFlashOn] = useState(false);
  const [streamActive, setStreamActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [processingPhoto, setProcessingPhoto] = useState(false);

  // 识别成功视觉状态
  const [scanSuccess, setScanSuccess] = useState(false);
  const [matchedUuidText, setMatchedUuidText] = useState('');

  // 播放清脆的 800Hz Web Audio 反馈提示音 (100% 兼容 iOS Safari / 微信 / Android)
  const playBeep = () => {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const ctx = new AudioContextClass();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(800, ctx.currentTime);
      gain.gain.setValueAtTime(0.35, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch { }
  };

  // 通用 UUID 匹配与跳转锁逻辑
  const handleMatchText = (text) => {
    if (isNavigating.current || !text) return false;

    const match =
      text.match(/\/m\/weld\/([a-f0-9-]{36})/i) ||
      text.match(/pipeline_uuid=([a-f0-9-]{36})/i) ||
      text.match(/^([a-f0-9-]{36})$/i);

    if (match) {
      const matchedUuid = match[1] || match[0];
      isNavigating.current = true;

      // 1. 触发双重正反馈：Audio 提示音 + 硬件震动
      playBeep();
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate([120, 40, 120]);
        } catch { }
      }

      // 2. 激活视觉“识别成功”绿框与气泡
      setScanSuccess(true);
      setMatchedUuidText(matchedUuid);

      // 3. 停止视频流
      if (scannerRef.current) {
        try {
          scannerRef.current.stop();
        } catch { }
      }

      // 4. 延迟 350ms 后无感跳转，留出充分的视觉确认感
      setTimeout(() => {
        if (onMatchedUuid) {
          onMatchedUuid(matchedUuid);
        } else {
          router.push(`/m/weld/${matchedUuid}`);
        }
      }, 350);

      return true;
    }
    return false;
  };

  useEffect(() => {
    if (!videoRef.current) return;

    isNavigating.current = false;
    setScanSuccess(false);
    setCameraError('');
    setStreamActive(false);

    const qrScanner = new QrScanner(
      videoRef.current,
      (result) => {
        const text = result?.data || (typeof result === 'string' ? result : '');
        handleMatchText(text);
      },
      {
        highlightScanRegion: false, // 禁用库自带画框
        highlightCodeOutline: false,
        returnDetailedScanResult: true,
        maxScansPerSecond: 15,
        calculateScanRegion: (video) => {
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
        setStreamActive(true);
        setCameraError('');

        try {
          QrScanner.hasFlash()
            .then((res) => setHasFlash(!!res))
            .catch(() => setHasFlash(true));
        } catch {
          setHasFlash(true);
        }
      })
      .catch((err) => {
        console.warn('Realtime camera stream failed:', err);
        setStreamActive(false);
        setCameraError(
          '当前环境限制了实时视频流。请点击下方【📷 使用系统相机拍照识别】按钮'
        );
      });

    return () => {
      try {
        qrScanner.stop();
        qrScanner.destroy();
      } catch { }
    };
  }, [router, onMatchedUuid]);

  // 补光灯/手电筒切换
  const toggleFlash = async () => {
    if (scannerRef.current) {
      try {
        await scannerRef.current.toggleFlash();
        setIsFlashOn(scannerRef.current.isFlashOn());
      } catch (err) {
        console.warn('Flashlight toggle failed:', err);
      }
    }
  };

  // 原生相机/相册照片 Web Worker 静态解码
  const handleFileScan = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setProcessingPhoto(true);
    setCameraError('');

    try {
      const result = await QrScanner.scanImage(file, {
        returnDetailedScanResult: true,
        alsoTryWithoutScanRegion: true,
      });

      const text = result?.data || (typeof result === 'string' ? result : '');
      const matched = handleMatchText(text);

      if (!matched) {
        setCameraError('未能在照片中提取到有效的管线二维码，请重试');
      }
    } catch {
      setCameraError('未能在拍摄的照片中识别到二维码，请保持清晰并重新拍摄');
    } finally {
      setProcessingPhoto(false);
      e.target.value = '';
    }
  };

  return (
    <div className="relative w-full h-full min-h-[460px] bg-black overflow-hidden flex flex-col justify-between p-4 select-none font-sans">
      {/* 隐藏的原生相机与相册 File Input */}
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

      {/* 实时视频/预览层 */}
      <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" />

      {/* 顶部控制栏 */}
      <div className="relative z-20 flex items-center justify-between text-white">
        <div className="bg-black/60 px-3 py-1.5 backdrop-blur-md border border-white/20 text-[13px] font-medium">
          📷 扫码定位管线号
        </div>

        <div className="flex items-center space-x-2">
          {streamActive && (
            <button
              type="button"
              onClick={toggleFlash}
              className="h-10 px-3 bg-black/60 hover:bg-black/80 backdrop-blur-md text-white text-[13px] font-medium border border-white/20 cursor-pointer outline-none flex items-center space-x-1"
            >
              <span>{isFlashOn ? '💡 关灯' : '🔦 开灯'}</span>
            </button>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] font-medium border-none cursor-pointer outline-none"
            >
              关闭
            </button>
          )}
        </div>
      </div>

      {/* 中央扫码视觉框 */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center pointer-events-none">
        <div
          className={`relative w-[260px] h-[260px] border-2 transition-all duration-300 ${scanSuccess ? 'border-[#24a148] bg-[#24a148]/20' : 'border-[#0f62fe]'
            } shadow-[0_0_0_9999px_rgba(0,0,0,0.65)]`}
        >
          {/* 四角高亮 */}
          <div
            className={`absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 transition-colors duration-300 ${scanSuccess ? 'border-[#24a148]' : 'border-[#0f62fe]'
              }`}
          />
          <div
            className={`absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 transition-colors duration-300 ${scanSuccess ? 'border-[#24a148]' : 'border-[#0f62fe]'
              }`}
          />
          <div
            className={`absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 transition-colors duration-300 ${scanSuccess ? 'border-[#24a148]' : 'border-[#0f62fe]'
              }`}
          />
          <div
            className={`absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 transition-colors duration-300 ${scanSuccess ? 'border-[#24a148]' : 'border-[#0f62fe]'
              }`}
          />

          {/* 扫码成功 Overlay 徽章 */}
          {scanSuccess ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#24a148]/30 backdrop-blur-xs animate-fade-in">
              <span className="text-[54px]">✅</span>
              <span className="text-white text-[16px] font-bold mt-1 tracking-wider">识别成功</span>
            </div>
          ) : (
            streamActive && (
              <div className="w-full h-1 bg-[#0f62fe] shadow-[0_0_8px_#0f62fe] animate-pulse absolute top-1/2 -translate-y-1/2" />
            )
          )}
        </div>

        {/* 底部提示文字 / 成功气泡 / 降级说明 */}
        <div className="mt-4 max-w-[320px] text-center pointer-events-auto">
          {scanSuccess ? (
            <div className="bg-[#24a148] text-white px-4 py-2.5 text-[13px] font-semibold flex items-center justify-center space-x-2 animate-pulse shadow-lg">
              <span>✅ 识别成功！正在加载管线数据...</span>
            </div>
          ) : processingPhoto ? (
            <div className="bg-[#0f62fe] text-white px-4 py-2 text-[13px] font-mono">
              [WeldSnap] 正在通过 Web Worker 解码照片...
            </div>
          ) : cameraError ? (
            <div className="bg-[#393939] text-[#f4f4f4] p-3 text-[12px] text-left border border-[#525252] leading-relaxed">
              {cameraError}
            </div>
          ) : (
            <div className="bg-black/60 px-4 py-2 text-white/90 text-[12px] font-mono inline-block backdrop-blur-md border border-white/20">
              将管线二维码对准中央框体，识别成功将自动跳转
            </div>
          )}
        </div>
      </div>

      {/* 底部 52px+ 工业级大按键操作区 */}
      <div className="relative z-20 space-y-2.5 pt-2">
        <button
          type="button"
          onClick={() => cameraFileInputRef.current && cameraFileInputRef.current.click()}
          className="w-full h-14 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[15px] font-semibold cursor-pointer rounded-none border-none outline-none flex items-center justify-center space-x-2"
        >
          <span className="text-[20px]">📷</span>
          <span>使用系统相机拍照识别</span>
        </button>

        <button
          type="button"
          onClick={() => albumFileInputRef.current && albumFileInputRef.current.click()}
          className="w-full h-13 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[14px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center justify-center space-x-2"
        >
          <span>🖼️ 从相册选择二维码照片</span>
        </button>
      </div>
    </div>
  );
}

export default RealtimeQRScanner;
