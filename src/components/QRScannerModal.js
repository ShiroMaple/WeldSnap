'use client';

import dynamic from 'next/dynamic';

// 动态 import 实时扫码组件并禁用 SSR，防止在 SSR 期间触发 navigator 或 HTMLVideoElement 未定义错误
const RealtimeQRScanner = dynamic(
  () => import('./RealtimeQRScanner').then((mod) => mod.RealtimeQRScanner || mod.default),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[420px] bg-black flex items-center justify-center text-white/80 text-[13px]">
        [WeldSnap] 正在初始化 Web Worker 扫码引擎...
      </div>
    ),
  }
);

/**
 * 移动端实时扫码 Modal 弹窗组件
 */
export default function QRScannerModal({ isOpen, onClose, onScanSuccess }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-black flex flex-col justify-between font-sans select-none">
      <RealtimeQRScanner
        onMatchedUuid={(matchedUuid) => {
          onScanSuccess(matchedUuid);
          onClose();
        }}
        onClose={onClose}
      />
    </div>
  );
}
