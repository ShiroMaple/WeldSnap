'use client';

/**
 * 二维码批量打印排版页 (Client Component)
 *
 * 特性：
 *   - 根据 URL 参数中的 project_uuid 与可选的 uuids (勾选的管线) 动态加载二维码
 *   - 清晰、规整的纸张排版格栅
 *   - 强制使用 CSS 打印分页令牌，防止单个二维码被横向切成两半
 */

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function QrCodesPrintContent() {
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState([]);
  const [serverIP, setServerIP] = useState('');
  const [port, setPort] = useState(3000);
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    async function checkAuthAndLoad() {
      try {
        // 1. 鉴权：必须是已登录的管理员
        const authResp = await fetch('/api/auth/check');
        const authData = await authResp.json();
        if (!authData.logged_in || authData.user.role !== 'admin') {
          router.push('/login');
          return;
        }

        // 2. 加载选中的管线或全量管线二维码
        const projectUuid = searchParams.get('project_uuid');
        const uuidsParam = searchParams.get('uuids');

        if (!projectUuid && !uuidsParam) {
          alert('缺少必需的打印参数');
          setLoading(false);
          return;
        }

        const queryParams = new URLSearchParams();
        if (projectUuid) queryParams.set('project_uuid', projectUuid);
        if (uuidsParam) queryParams.set('uuids', uuidsParam);

        const qrResp = await fetch(`/api/admin/qrcodes?${queryParams.toString()}`);
        const qrData = await qrResp.json();
        if (qrResp.ok && qrData.success) {
          setItems(qrData.items || []);
          setServerIP(qrData.serverIP || '');
          setPort(qrData.port || 3000);
        } else {
          alert(qrData.error || '获取二维码列表失败');
        }
      } catch (err) {
        alert('加载失败，网络连接异常');
      } finally {
        setLoading(false);
      }
    }

    checkAuthAndLoad();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white font-mono text-[#525252] text-[14px]">
        [WeldSnap] Generating printable layout...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white p-8 font-sans">
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          .print-avoid-break {
            page-break-inside: avoid !important;
            break-inside: avoid-page !important;
            break-inside: avoid !important;
          }
        }
      `}} />

      {/* 顶栏控制面板 (打印时隐藏) */}
      <div className="mb-8 p-4 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-between print:hidden select-none rounded-none">
        <div>
          <h1 className="text-[18px] font-semibold text-[#161616]">管线二维码批量打印页</h1>
          <p className="text-[12px] text-[#525252] mt-1">
            当前绑定局域网服务器地址: <span className="font-mono text-[#0f62fe]">http://{serverIP}:{port}</span>
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.print()}
            className="h-10 px-6 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[13px] cursor-pointer rounded-none border-none font-medium"
          >
            🖨️ 调用系统打印
          </button>
          <button
            onClick={() => window.close()}
            className="h-10 px-5 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[#161616] text-[13px] cursor-pointer rounded-none"
          >
            关闭页面
          </button>
        </div>
      </div>

      {/* 二维码打印格栅 */}
      {items.length === 0 ? (
        <div className="text-center py-16 text-[#8d8d8d] text-[14px] font-mono">
          暂无管线数据，请确保已勾选或管线不为空。
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8 print:grid-cols-2 print:gap-12">
          {items.map((item) => (
            <div
              key={item.pipeline_no}
              className="print-avoid-break border border-[#c6c6c6] p-6 flex flex-col items-center justify-center text-center bg-white rounded-none print:border-[#999] print:p-4"
              style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
            >
              <img
                src={item.qr}
                alt={item.pipeline_no}
                className="w-48 h-48 bg-white border border-[#e0e0e0] p-1 print:w-44 print:h-44"
              />
              <div className="mt-4 w-full">
                <span className="block font-mono text-[15px] font-bold text-[#161616] truncate">
                  管线号: {item.pipeline_no}
                </span>
                <span className="block font-mono text-[9px] text-[#8d8d8d] truncate mt-1.5 print:text-[8px]">
                  {item.url}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 打印专用底栏 */}
      <footer className="hidden print:block text-center text-[10px] text-[#8d8d8d] mt-12 font-mono border-t border-dashed border-[#ccc] pt-4">
        WeldSnap V2.0 管道焊口照片拍照系统 — 二维码打印凭证
      </footer>
    </div>
  );
}

export default function QrCodesPrintPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-white font-mono text-[#525252] text-[14px]">[WeldSnap] Loading printable layout...</div>}>
      <QrCodesPrintContent />
    </Suspense>
  );
}
