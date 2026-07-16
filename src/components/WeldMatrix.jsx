'use client';

/**
 * 焊口工序进度矩阵矩阵表格 (Client Component)
 *
 * 特性：
 *   - 纯扁平设计，无纵向网格线，行底线为细线 (#e0e0e0)
 *   - 工序进度胶囊化呈现：已完成 10% 绿底；待录入 10% 暖沙黄底
 *   - 悬浮预览气泡：鼠标 Hover 到已上传照片时，在鼠标旁显示浮动的照片缩略图预览
 *   - 点击“已上传”时打开 Modal 弹窗显示完整照片，可交互下载保存，管理员亦可在此将其标记为不合格（需重传）
 *   - 点击“未上传”时调起本地选择，自动压缩并上传云端 OSS，轻量回写同步数据
 *   - 点击“需重传”时，管理员可预览历史不合格照片并提供重新上传通道
 */

import { useState, useRef } from 'react';
import { compressImage } from '@/lib/compress';

export default function WeldMatrix({ records = [], onRefresh }) {
  const [hoveredPhoto, setHoveredPhoto] = useState(null); // 存储当前 hover 的照片相对路径
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ─── 查看完整大图 Modal 状态 ────────────────────────────
  const [viewPhotoPath, setViewPhotoPath] = useState(null);
  const [viewPhotoInfo, setViewPhotoInfo] = useState({ pipelineNo: '', weldNo: '', typeLabel: '', typeKey: '' });

  // ─── 网页端直接上传工序照片状态 ──────────────────────────
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // { pipelineNo, weldNo, type }
  const [uploadStatus, setUploadStatus] = useState('idle'); // idle, compressing, signing, uploading, confirming, success, error
  const [uploadError, setUploadError] = useState('');

  const handleMouseEnter = (photoPath, event) => {
    if (!photoPath) return;
    setMousePos({ x: event.clientX, y: event.clientY });
    setHoveredPhoto(photoPath);
  };

  const handleMouseMove = (event) => {
    setMousePos({ x: event.clientX, y: event.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredPhoto(null);
  };

  // 智能计算浮动框 Top 位置避免超出视口顶部
  const tooltipTop = mousePos.y - 200 < 10 ? mousePos.y + 15 : mousePos.y - 200;
  const tooltipLeft = mousePos.x + 15;

  // ─── 大图 Modal 交互 ───────────────────────────────────
  const handleOpenPhotoModal = (path, pipelineNo, weldNo, typeLabel, typeKey) => {
    setViewPhotoPath(path);
    setViewPhotoInfo({ pipelineNo, weldNo, typeLabel, typeKey });
    setHoveredPhoto(null); // 隐藏悬浮框
  };

  const handleClosePhotoModal = () => {
    setViewPhotoPath(null);
  };

  // 标记为不合格（需重传）
  const handleRejectPhoto = async () => {
    if (!viewPhotoInfo.typeKey) return;
    if (!confirm(`确定将管线 ${viewPhotoInfo.pipelineNo} 焊口 ${viewPhotoInfo.weldNo} 的【${viewPhotoInfo.typeLabel}】标记为不合格？\n标记后状态将变更为“需重传”，且会通知施工人员。`)) return;

    try {
      const resp = await fetch('/api/admin/photo/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_no: viewPhotoInfo.pipelineNo,
          weld_no: viewPhotoInfo.weldNo,
          photo_type: viewPhotoInfo.typeKey,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setViewPhotoPath(null); // 关闭大图弹窗
        if (onRefresh) onRefresh(); // 刷新表格数据
      } else {
        alert(data.error || '操作失败');
      }
    } catch (err) {
      alert('网络连接错误，请检查网络');
    }
  };

  const handleDownloadPhoto = async () => {
    if (!viewPhotoPath) return;
    try {
      const response = await fetch(`/api/photo/preview?path=${encodeURIComponent(viewPhotoPath)}`);
      if (!response.ok) throw new Error('下载失败');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      // 构造文件名：PL-001_W-01_组对工序.jpg
      const cleanLabel = viewPhotoInfo.typeLabel.replace(/\s+/g, '');
      a.download = `${viewPhotoInfo.pipelineNo}_${viewPhotoInfo.weldNo}_${cleanLabel}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      // 降级：直接在新窗口打开
      window.open(`/api/photo/preview?path=${encodeURIComponent(viewPhotoPath)}`, '_blank');
    }
  };

  // ─── 上传照片交互 ─────────────────────────────────────
  const handleUploadClick = (pipelineNo, weldNo, type) => {
    setUploadTarget({ pipelineNo, weldNo, type });
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget) return;

    const { pipelineNo, weldNo, type } = uploadTarget;
    setUploadError('');
    setUploadStatus('compressing');

    try {
      // 1. 本地 Canvas 压缩图片
      const compressedBlob = await compressImage(file, 1920, 1080, 0.8);

      // 2. 获取预签名上传凭证
      setUploadStatus('signing');
      const signResp = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_no: pipelineNo,
          weld_no: weldNo,
          photo_type: type,
        }),
      });
      const signData = await signResp.json();
      if (!signResp.ok || !signData.success) {
        throw new Error(signData.error || '获取上传凭证失败');
      }

      const { signedUrl, objectKey } = signData;

      // 3. 直接上传至云存储 OSS
      setUploadStatus('uploading');
      const ossResp = await fetch(signedUrl, {
        method: 'PUT',
        body: compressedBlob,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });
      if (ossResp.status !== 200) {
        throw new Error('直传存储服务器被拒绝');
      }

      // 4. 同步状态写入数据库
      setUploadStatus('confirming');
      const confirmResp = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_no: pipelineNo,
          weld_no: weldNo,
          photo_type: type,
          objectKey: objectKey,
        }),
      });
      const confirmData = await confirmResp.json();
      if (!confirmResp.ok || !confirmData.success) {
        throw new Error(confirmData.error || '数据库状态确认失败');
      }

      setUploadStatus('success');
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadTarget(null);
        if (onRefresh) onRefresh();
      }, 1000);

    } catch (err) {
      setUploadStatus('error');
      setUploadError(err.message || '上传时发生未知错误');
    } finally {
      e.target.value = ''; // 重置 Input
    }
  };

  return (
    <div className="flex-1 overflow-auto p-6 relative">
      {records.length === 0 ? (
        <div className="h-full flex items-center justify-center text-[#8d8d8d] text-[14px] font-mono select-none">
          请在左侧导航树选择要查看的管线号
        </div>
      ) : (
        <div className="w-full">
          <table className="w-full border-collapse text-[13px] text-left select-none">
            <thead>
              <tr className="border-b border-[#c6c6c6] text-[#525252] font-semibold">
                <th className="pb-3 pr-4 font-medium">焊口号</th>
                <th className="pb-3 px-4 font-medium">组对工序</th>
                <th className="pb-3 px-4 font-medium">打底工序</th>
                <th className="pb-3 px-4 font-medium">盖面工序</th>
                <th className="pb-3 px-4 font-medium">最近上传人</th>
                <th className="pb-3 pl-4 font-medium">最近上传时间</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e0e0e0] text-[#161616]">
              {records.map((r) => {
                const cellRender = (field, typeKey, typeLabel) => {
                  const path = r[field];
                  if (!path) {
                    return (
                      <span
                        onClick={() => handleUploadClick(r.pipeline_no, r.weld_no, typeKey)}
                        className="inline-block px-3 py-1 bg-[#f1c21b]/10 text-[#525252] text-[11px] rounded-none cursor-pointer hover:bg-[#f1c21b]/20 hover:text-[#161616] transition-all font-medium"
                      >
                        未上传
                      </span>
                    );
                  }

                  if (path.startsWith('REJECTED:')) {
                    return (
                      <span
                        onMouseEnter={(e) => handleMouseEnter(path, e)}
                        onMouseMove={handleMouseMove}
                        onMouseLeave={handleMouseLeave}
                        onClick={() => handleOpenPhotoModal(path, r.pipeline_no, r.weld_no, typeLabel, typeKey)}
                        className="inline-block px-3 py-1 bg-[#da1e28]/10 text-[#da1e28] font-semibold text-[11px] rounded-none cursor-pointer hover:bg-[#da1e28]/25 transition-all border border-[#da1e28]/20 animate-pulse"
                      >
                        需重传
                      </span>
                    );
                  }

                  return (
                    <span
                      onMouseEnter={(e) => handleMouseEnter(path, e)}
                      onMouseMove={handleMouseMove}
                      onMouseLeave={handleMouseLeave}
                      onClick={() => handleOpenPhotoModal(path, r.pipeline_no, r.weld_no, typeLabel, typeKey)}
                      className="inline-block px-3 py-1 bg-[#24a148]/10 text-[#24a148] font-medium text-[11px] rounded-none cursor-pointer hover:bg-[#24a148]/20 transition-all"
                    >
                      已上传
                    </span>
                  );
                };

                return (
                  <tr key={r.id} className="hover:bg-[#f4f4f4] transition-colors duration-100">
                    <td className="py-3.5 pr-4 font-mono font-medium">{r.weld_no}</td>
                    
                    {/* 组对 */}
                    <td className="py-3.5 px-4">
                      {cellRender('photo_zudui', 'zudui', '组对工序')}
                    </td>

                    {/* 打底 */}
                    <td className="py-3.5 px-4">
                      {cellRender('photo_dadi', 'dadi', '打底工序')}
                    </td>

                    {/* 盖面 */}
                    <td className="py-3.5 px-4">
                      {cellRender('photo_gaimian', 'gaimian', '盖面工序')}
                    </td>

                    <td className="py-3.5 px-4 text-[#525252]">{r.uploaded_by || '-'}</td>
                    <td className="py-3.5 pl-4 text-[#525252] font-mono">{r.uploaded_at || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 隐藏的文件上传输入框 */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* 悬浮缩略图预览气泡 (采用 fixed 并在鼠标旁跟随) */}
      {hoveredPhoto && (
        <div
          className="fixed z-[99999] p-1 bg-[#e0e0e0] border border-[#c6c6c6] rounded-none w-64 h-48 pointer-events-none transition-opacity duration-150"
          style={{
            left: `${tooltipLeft}px`,
            top: `${tooltipTop}px`,
          }}
        >
          <div className="w-full h-full bg-[#f4f4f4] flex items-center justify-center overflow-hidden">
            <img
              src={`/api/photo/preview?path=${encodeURIComponent(hoveredPhoto)}`}
              alt="工序照片预览"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* ─── MODAL 1: 完整大图查看 ───────────────────────── */}
      {viewPhotoPath && (
        <div className="fixed inset-0 bg-black/75 z-[99999] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[800px] bg-white border border-[#e0e0e0] flex flex-col rounded-none shadow-none">
            {/* Modal 头部 */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#e0e0e0] select-none">
              <div>
                <h3 className="text-[16px] font-semibold text-[#161616]">
                  {viewPhotoInfo.typeLabel} 照片详情
                </h3>
                <span className="text-[12px] text-[#525252] font-mono">
                  管线号: {viewPhotoInfo.pipelineNo} | 焊口号: {viewPhotoInfo.weldNo}
                  {viewPhotoPath.startsWith('REJECTED:') && (
                    <span className="text-[#da1e28] ml-2 font-semibold"> (❌ 需重传)</span>
                  )}
                </span>
              </div>
              <button
                onClick={handleClosePhotoModal}
                className="bg-transparent border-none text-[#525252] hover:text-[#161616] text-[20px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 图片展示区 */}
            <div className="p-4 bg-[#f4f4f4] flex items-center justify-center overflow-hidden min-h-[300px] max-h-[70vh]">
              <img
                src={`/api/photo/preview?path=${encodeURIComponent(viewPhotoPath)}`}
                alt="Weld Photo Full View"
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>

            {/* Modal 底部控制区 */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[#e0e0e0] select-none">
              {/* 如果照片尚未被标记为不合格，则向管理员展示此按钮 */}
              {!viewPhotoPath.startsWith('REJECTED:') && (
                <button
                  onClick={handleRejectPhoto}
                  className="h-10 px-5 bg-[#da1e28] hover:bg-[#b21922] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium mr-auto"
                >
                  标记不合格 (需重传)
                </button>
              )}
              
              {/* 如果照片已被标记为不合格，则展示一键重新上传通道 */}
              {viewPhotoPath.startsWith('REJECTED:') && (
                <button
                  onClick={() => {
                    setViewPhotoPath(null); // 关闭预览 Modal
                    handleUploadClick(viewPhotoInfo.pipelineNo, viewPhotoInfo.weldNo, viewPhotoInfo.typeKey);
                  }}
                  className="h-10 px-5 bg-[#da1e28] hover:bg-[#b21922] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium mr-auto"
                >
                  重新上传覆盖照片
                </button>
              )}

              <button
                onClick={handleClosePhotoModal}
                className="h-10 px-5 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[13px] text-[#161616] cursor-pointer rounded-none"
              >
                关闭
              </button>
              <button
                onClick={handleDownloadPhoto}
                className="h-10 px-6 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium"
              >
                保存下载图片
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: 上传照片进度指示器 ──────────────────── */}
      {uploadStatus !== 'idle' && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[360px] bg-white border border-[#e0e0e0] p-6 rounded-none text-center select-none">
            {uploadStatus === 'compressing' && (
              <div>
                <div className="animate-spin inline-block w-8 h-8 border-4 border-[#0f62fe] border-t-transparent rounded-full mb-3" />
                <p className="text-[14px] text-[#161616] font-medium">正在本地压缩照片...</p>
                <p className="text-[11px] text-[#8d8d8d] mt-1">压缩至 1920x1080 大小以节省流量</p>
              </div>
            )}
            {uploadStatus === 'signing' && (
              <div>
                <div className="animate-spin inline-block w-8 h-8 border-4 border-[#0f62fe] border-t-transparent rounded-full mb-3" />
                <p className="text-[14px] text-[#161616] font-medium">正在向云端获取授权凭证...</p>
              </div>
            )}
            {uploadStatus === 'uploading' && (
              <div>
                <div className="animate-spin inline-block w-8 h-8 border-4 border-[#0f62fe] border-t-transparent rounded-full mb-3" />
                <p className="text-[14px] text-[#161616] font-medium">正在向云存储直传照片...</p>
              </div>
            )}
            {uploadStatus === 'confirming' && (
              <div>
                <div className="animate-spin inline-block w-8 h-8 border-4 border-[#0f62fe] border-t-transparent rounded-full mb-3" />
                <p className="text-[14px] text-[#161616] font-medium">正在同步写入数据库...</p>
              </div>
            )}
            {uploadStatus === 'success' && (
              <div>
                <span className="text-[32px] text-[#24a148] block mb-2">✓</span>
                <p className="text-[14px] text-[#24a148] font-semibold">上传成功</p>
                <p className="text-[11px] text-[#525252] mt-1">工序记录已刷新</p>
              </div>
            )}
            {uploadStatus === 'error' && (
              <div>
                <span className="text-[32px] text-[#da1e28] block mb-2">✕</span>
                <p className="text-[14px] text-[#da1e28] font-semibold">上传失败</p>
                <p className="text-[12px] text-[#525252] mt-2 leading-relaxed break-all">
                  {uploadError}
                </p>
                <button
                  onClick={() => {
                    setUploadStatus('idle');
                    setUploadTarget(null);
                  }}
                  className="mt-5 h-9 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] cursor-pointer rounded-none border-none outline-none"
                >
                  关闭
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
