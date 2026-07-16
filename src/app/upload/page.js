'use client';

/**
 * 移动端自适应照片上传页面 (Client Component)
 *
 * 特性：
 *   - 支持扫码进入自动带出管线号，或手动联想过滤搜索管线号
 *   - 下拉选择焊口号（已完工的焊口置灰显示）
 *   - 组对、打底、盖面三大工序大触控拍照卡片设计
 *   - Canvas 本地抢跑压缩（降维至 1920x1080，0.8 质量）
 *   - **云端直传 (Scheme B)**：利用 /api/upload/sign 获取签名，前端 PUT 直传云存储，
 *     完成后调用 /api/upload/confirm 轻量回写确认
 *   - 进度状态全程反馈 (正在压缩...正在直传...已上传)
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { compressImage } from '@/lib/compress';

const PHOTO_TYPES = [
  { id: 'zudui', name: '组对工序', label: '组对' },
  { id: 'dadi', name: '打底工序', label: '打底' },
  { id: 'gaimian', name: '盖面工序', label: '盖面' },
];

function UploadContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── 业务状态 ───────────────────────────────────────────
  const [pipelineQuery, setPipelineQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [selectedWeld, setSelectedWeld] = useState('');
  const [weldsList, setWeldsList] = useState([]);

  // 保存当前选中的焊口的3个工序上传状态 (相对路径值)
  const [uploadedPhotos, setUploadedPhotos] = useState({
    zudui: null,
    dadi: null,
    gaimian: null,
  });

  // 每个工序的上传状态描述 (未上传, 正在压缩..., 正在上传云端..., 已上传, 失败)
  const [statusMsg, setStatusMsg] = useState({
    zudui: '未上传',
    dadi: '未上传',
    gaimian: '未上传',
  });

  const [isSubmitting, setIsSubmitting] = useState({
    zudui: false,
    dadi: false,
    gaimian: false,
  });

  // 完成提交后的成功显示状态
  const [showSuccessPage, setShowSuccessPage] = useState(false);

  // 文件选择 Input 的 ref 钩子
  const fileInputRefs = {
    zudui: useRef(null),
    dadi: useRef(null),
    gaimian: useRef(null),
  };

  // ─── 认证检查与扫码定位 ──────────────────────────────────
  useEffect(() => {
    async function initPage() {
      try {
        const resp = await fetch('/api/auth/check');
        const data = await resp.json();
        if (!data.logged_in) {
          router.push('/login');
          return;
        }
        setCurrentUser(data.user);

        // 检查 URL parameters 中是否包含管线参数
        const pipelineParam = searchParams.get('pipeline');
        if (pipelineParam) {
          handleSelectPipeline(decodeURIComponent(pipelineParam));
        }
        setLoading(false);
      } catch (err) {
        router.push('/login');
      }
    }
    initPage();
  }, [router, searchParams]);

  // ─── 用户退出 ───────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      alert('注销失败，请重试');
    }
  };

  // ─── 管线模糊搜索 ───────────────────────────────────────
  const handleSearchInputChange = async (e) => {
    const val = e.target.value;
    setPipelineQuery(val);

    if (!val.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      const resp = await fetch(`/api/welds/search?q=${encodeURIComponent(val.trim())}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setSearchResults(data.results || []);
        setShowSearchResults(true);
      }
    } catch {}
  };

  // 选中管线号，加载对应的所有焊口列表
  const handleSelectPipeline = async (pipelineNo) => {
    setSelectedPipeline(pipelineNo);
    setShowSearchResults(false);
    setPipelineQuery('');
    setWeldsList([]);
    setSelectedWeld('');
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });

    try {
      const resp = await fetch(`/api/welds/by-pipeline/${encodeURIComponent(pipelineNo)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setWeldsList(data.welds || []);
      } else {
        alert(data.error || '该管线号无焊口记录');
        setSelectedPipeline('');
      }
    } catch {
      alert('网络连接错误，无法读取焊口');
      setSelectedPipeline('');
    }
  };

  // ─── 焊口选择联动 ───────────────────────────────────────
  const handleWeldChange = (e) => {
    const weldNo = e.target.value;
    setSelectedWeld(weldNo);
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });

    if (!weldNo) return;

    // 查找当前选中焊口已有的照片路径
    const found = weldsList.find((w) => w.weld_no === weldNo);
    if (found) {
      const initialPhotos = {
        zudui: found.photo_zudui || null,
        dadi: found.photo_dadi || null,
        gaimian: found.photo_gaimian || null,
      };
      setUploadedPhotos(initialPhotos);
      setStatusMsg({
        zudui: found.photo_zudui ? '已上传' : '未上传',
        dadi: found.photo_dadi ? '已上传' : '未上传',
        gaimian: found.photo_gaimian ? '已上传' : '未上传',
      });
    }
  };

  // ─── 照片拍照与直传 OSS 逻辑 (Scheme B) ───────────────────
  const triggerCapture = (type) => {
    fileInputRefs[type].current.click();
  };

  const handleCaptureAndUpload = async (type, e) => {
    const file = e.target.files[0];
    if (!file) return;

    // 1. 进入压缩状态
    setIsSubmitting((prev) => ({ ...prev, [type]: true }));
    setStatusMsg((prev) => ({ ...prev, [type]: '正在压缩照片...' }));

    let compressedBlob;
    try {
      compressedBlob = await compressImage(file, 1920, 1080, 0.8);
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: '压缩失败，请重试' }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 2. 向后端请求预签名上传凭证
    setStatusMsg((prev) => ({ ...prev, [type]: '获取上传凭证...' }));
    let signedUrl;
    let objectKey;

    try {
      const resp = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_no: selectedPipeline,
          weld_no: selectedWeld,
          photo_type: type,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || '获取上传门禁失败');
      }
      signedUrl = data.signedUrl;
      objectKey = data.objectKey;
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: `凭证错误: ${err.message}` }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 3. 前端直传云端 OSS (PUT 请求，设置 Content-Type: image/jpeg)
    setStatusMsg((prev) => ({ ...prev, [type]: '正在上传云存储...' }));
    try {
      const ossResp = await fetch(signedUrl, {
        method: 'PUT',
        body: compressedBlob,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });

      if (ossResp.status !== 200) {
        throw new Error('直传 OSS 被存储服务器拒绝');
      }
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: '云端直传失败，请重试' }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 4. 后端轻量级状态确认回写
    setStatusMsg((prev) => ({ ...prev, [type]: '正在同步回写...' }));
    try {
      const confirmResp = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_no: selectedPipeline,
          weld_no: selectedWeld,
          photo_type: type,
          objectKey: objectKey,
        }),
      });
      const confirmData = await confirmResp.json();

      if (confirmResp.ok && confirmData.success) {
        setUploadedPhotos((prev) => ({ ...prev, [type]: objectKey }));
        setStatusMsg((prev) => ({ ...prev, [type]: '已上传' }));
      } else {
        throw new Error(confirmData.error || '数据库回写错误');
      }
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: `状态确认失败: ${err.message}` }));
    } finally {
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      e.target.value = ''; // 清空 file input
    }
  };

  // ─── 提交收尾 ───────────────────────────────────────────
  const handleSubmitAll = () => {
    setShowSuccessPage(true);
  };

  const handleResetForm = () => {
    setShowSuccessPage(false);
    setSelectedWeld('');
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });
    
    // 如果 URL 中有固定管线参数，重新加载；若无，重置管线选择
    const pipelineParam = searchParams.get('pipeline');
    if (pipelineParam) {
      handleSelectPipeline(decodeURIComponent(pipelineParam));
    } else {
      setSelectedPipeline('');
    }
  };

  const allPhotosUploaded =
    uploadedPhotos.zudui && uploadedPhotos.dadi && uploadedPhotos.gaimian;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] font-mono text-[#525252] text-[14px]">
        [WeldSnap] Initializing worker console...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] p-4 font-sans select-none max-w-[600px] mx-auto flex flex-col justify-between">
      {/* 头部条 */}
      <header className="flex items-center justify-between border-b border-[#e0e0e0] pb-3 mb-5">
        <div>
          <h1 className="text-[18px] font-semibold text-[#161616]">拍照录入</h1>
          <span className="text-[11px] text-[#525252]">当前账号: {currentUser.display_name || currentUser.username}</span>
        </div>
        <button
          onClick={handleLogout}
          className="text-[#da1e28] text-[13px] font-normal hover:underline bg-transparent border-none cursor-pointer outline-none"
        >
          退出
        </button>
      </header>

      {/* 成功页 */}
      {showSuccessPage ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center bg-white border border-[#e0e0e0] p-6 rounded-none shadow-none">
          <span className="text-[64px] text-[#24a148] mb-4">✓</span>
          <h2 className="text-[20px] font-light text-[#161616] mb-2">录入提交成功</h2>
          <p className="text-[13px] text-[#525252] max-w-[320px] leading-relaxed mb-8">
            管线号 <span className="font-mono font-semibold">{selectedPipeline}</span> - 焊口号 <span className="font-mono font-semibold">{selectedWeld}</span> 的三张工序（组对、打底、盖面）照片已全部安全上传至云存储归档。
          </p>
          <button
            onClick={handleResetForm}
            className="w-full h-11 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[14px] cursor-pointer rounded-none border-none outline-none"
          >
            录入下一个焊口
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between">
          <div>
            {/* 1. 管线定位区 */}
            {selectedPipeline ? (
              <div className="bg-[#edf5ff] border border-[#0f62fe] p-4 rounded-none flex items-center justify-between mb-4">
                <div>
                  <span className="text-[11px] text-[#0f62fe] block">已定位管线号</span>
                  <span className="text-[16px] font-mono font-semibold text-[#161616]">{selectedPipeline}</span>
                </div>
                {!searchParams.get('pipeline') && (
                  <button
                    onClick={() => {
                      setSelectedPipeline('');
                      setSelectedWeld('');
                    }}
                    className="text-[13px] text-[#0f62fe] hover:underline bg-transparent border-none cursor-pointer outline-none"
                  >
                    更换
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-col mb-4 relative">
                <span className="text-[12px] text-[#525252] mb-1.5">扫描或搜索定位管线号</span>
                <div className="relative">
                  <input
                    type="text"
                    value={pipelineQuery}
                    onChange={handleSearchInputChange}
                    placeholder="输入管线号过滤关键字..."
                    className="w-full h-11 px-4 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
                  />
                  {showSearchResults && (
                    <div className="absolute top-[45px] left-0 right-0 border border-[#e0e0e0] bg-white max-h-[200px] overflow-y-auto z-[9999]">
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-[13px] text-[#8d8d8d] text-center">无匹配管线</div>
                      ) : (
                        searchResults.map((item) => (
                          <div
                            key={item.pipeline_no}
                            onClick={() => handleSelectPipeline(item.pipeline_no)}
                            className="p-3 border-b border-[#f4f4f4] last:border-b-0 cursor-pointer hover:bg-[#f4f4f4] text-[13px]"
                          >
                            <span className="font-mono font-semibold text-[#161616] block">{item.pipeline_no}</span>
                            <span className="text-[11px] text-[#8d8d8d] block mt-0.5">{item.project_name} | {item.construction_no}</span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. 焊口号下拉选择区 */}
            {selectedPipeline && (
              <div className="flex flex-col mb-4">
                <span className="text-[12px] text-[#525252] mb-1.5">选择焊口号</span>
                <select
                  value={selectedWeld}
                  onChange={handleWeldChange}
                  className="w-full h-11 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                >
                  <option value="">请选择焊口号</option>
                  {weldsList.map((w) => {
                    const isAllDone = w.photo_zudui && w.photo_dadi && w.photo_gaimian;
                    return (
                      <option key={w.id} value={w.weld_no} disabled={isAllDone}>
                        {w.weld_no} {isAllDone ? '(已完工)' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}

            {/* 3. 三大工序拍照卡片 */}
            {selectedPipeline && selectedWeld && (
              <div className="space-y-4 mt-6">
                {PHOTO_TYPES.map((type) => {
                  const path = uploadedPhotos[type.id];
                  const msg = statusMsg[type.id];
                  const loadingState = isSubmitting[type.id];
                  const isDone = !!path;

                  return (
                    <div
                      key={type.id}
                      className={`border p-4 bg-white rounded-none flex items-center justify-between transition-colors duration-150
                        ${isDone ? 'border-[#24a148]' : 'border-[#e0e0e0]'}
                      `}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <span className="text-[14px] font-semibold text-[#161616] block">{type.name}</span>
                        <span
                          className={`text-[12px] block mt-1 font-mono
                            ${
                              isDone
                                ? 'text-[#24a148]'
                                : loadingState
                                ? 'text-[#0f62fe] font-medium'
                                : 'text-[#8d8d8d]'
                            }
                          `}
                        >
                          {msg}
                        </span>

                        {/* 如果已上传，则在卡片下方呈现预览图 */}
                        {isDone && (
                          <div className="mt-3 w-32 h-24 bg-[#f4f4f4] border border-[#e0e0e0] overflow-hidden flex items-center justify-center">
                            <img
                              src={`/api/photo/preview?path=${encodeURIComponent(path)}`}
                              alt={type.label}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        )}
                      </div>

                      {/* 拍照 Input (隐藏) */}
                      <input
                        type="file"
                        ref={fileInputRefs[type.id]}
                        accept="image/*"
                        capture="environment" // 直接唤起后置摄像头
                        onChange={(e) => handleCaptureAndUpload(type.id, e)}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => triggerCapture(type.id)}
                        disabled={loadingState}
                        className={`h-9 px-4 text-[12px] cursor-pointer rounded-none outline-none border transition-colors duration-150
                          ${
                            isDone
                              ? 'border-[#c6c6c6] bg-white hover:bg-[#f4f4f4] text-[#161616]'
                              : 'border-transparent bg-[#0f62fe] hover:bg-[#0353e9] text-white font-medium'
                          }
                          disabled:bg-[#8d8d8d] disabled:cursor-not-allowed
                        `}
                      >
                        {isDone ? '重新拍照' : '拍照上传'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 4. 一键完成提交区 */}
          {selectedPipeline && selectedWeld && (
            <div className="mt-8 select-none">
              <button
                type="button"
                onClick={handleSubmitAll}
                disabled={!allPhotosUploaded}
                className="w-full h-12 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[14px] font-semibold transition-colors duration-150 rounded-none border-none outline-none disabled:bg-[#8d8d8d] disabled:cursor-not-allowed cursor-pointer"
              >
                提交完成
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] font-mono text-[#525252] text-[14px]">[WeldSnap] Loading form...</div>}>
      <UploadContent />
    </Suspense>
  );
}
