'use client';

/**
 * 移动端自适应照片上传页面 (Client Component)
 *
 * 特性：
 *   - 支持扫码进入自动定位（基于全局唯一 pipeline_uuid），或手动搜索定位
 *   - 下拉选择焊口号（已完工的焊口置灰显示）
 *   - 支持任何人（包括施工员与匿名用户）直接在现场新增焊口：
 *     - 若项目设定了前缀，则点击按钮自动按格式（如 W-01）递增编号
 *     - 若未设定前缀，提供文本框输入自定义编号
 *   - 组对、打底、盖面三大工序大触控拍照卡片设计，支持不合格驳回照片的直观对比预览
 *   - 云端直传（去语义化平摊存储）：Object Key 统一命名为 projects/{project_uuid}/{weld_uuid}_{工序}.jpg
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

  const [selectedPipelineUuid, setSelectedPipelineUuid] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState(''); // 管线名称
  const [projectInfo, setProjectInfo] = useState({ name: '', constructionNo: '', weldPrefix: '' });
  
  const [selectedWeld, setSelectedWeld] = useState('');
  const [weldsList, setWeldsList] = useState([]);

  // 现场新增焊口输入框状态 (未设定前缀时使用)
  const [newWeldName, setNewWeldName] = useState('');
  const [addingWeld, setAddingWeld] = useState(false);

  // 保存当前选中的焊口的3个工序上传状态 (相对路径值)
  const [uploadedPhotos, setUploadedPhotos] = useState({
    zudui: null,
    dadi: null,
    gaimian: null,
  });

  // 每个工序的上传状态描述
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

  // 压缩参数（从 API 动态读取）
  const [compressConfig, setCompressConfig] = useState({ enabled: true, maxWidth: 1920, maxHeight: 1080, quality: 0.8 });

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

        // 检查 URL parameters 中是否包含管线 UUID 参数
        const pipelineUuidParam = searchParams.get('pipeline_uuid');
        if (pipelineUuidParam) {
          handleSelectPipelineUuid(pipelineUuidParam);
        }
        setLoading(false);
      } catch (err) {
        router.push('/login');
      }
    }
    initPage();
  }, [router, searchParams]);

  // 拉取压缩参数
  useEffect(() => {
    fetch('/api/settings/compression')
      .then(r => r.json())
      .then(data => { if (data.success) setCompressConfig(data.compression); })
      .catch(() => {});
  }, []);

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
  const handleSelectPipelineUuid = async (pipelineUuid) => {
    setSelectedPipelineUuid(pipelineUuid);
    setShowSearchResults(false);
    setPipelineQuery('');
    setWeldsList([]);
    setSelectedWeld('');
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });

    try {
      const resp = await fetch(`/api/welds/by-pipeline/${encodeURIComponent(pipelineUuid)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setSelectedPipeline(data.pipeline_no);
        setWeldsList(data.welds || []);
        setProjectInfo({
          name: data.project_name,
          constructionNo: data.construction_no,
          weldPrefix: data.weld_prefix || '',
        });
      } else {
        alert(data.error || '定位管线失败');
        setSelectedPipelineUuid('');
      }
    } catch {
      alert('网络连接错误，无法读取焊口');
      setSelectedPipelineUuid('');
    }
  };

  // ─── 现场快捷新增焊口 ────────────────────────────────────
  const handleAddWeldOnsite = async () => {
    if (!selectedPipelineUuid) return;
    
    // 如果没有前缀，则强制要求手动录入焊口号
    if (!projectInfo.weldPrefix && !newWeldName.trim()) {
      alert('请输入要新增的焊口号');
      return;
    }

    setAddingWeld(true);
    try {
      const resp = await fetch('/api/welds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_uuid: selectedPipelineUuid,
          weld_no: projectInfo.weldPrefix ? '' : newWeldName.trim(),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert(`成功新增焊口: ${data.weld_no}`);
        setNewWeldName('');
        // 重新拉取焊口列表，并默认选中当前创建的这个
        const listResp = await fetch(`/api/welds/by-pipeline/${encodeURIComponent(selectedPipelineUuid)}`);
        const listData = await listResp.json();
        if (listResp.ok && listData.success) {
          setWeldsList(listData.welds || []);
          // 选中当前新增的焊口
          setTimeout(() => {
            setSelectedWeld(data.weld_no);
            // 触发联动更新状态为未上传
            setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
            setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });
          }, 100);
        }
      } else {
        alert(data.error || '新增焊口失败');
      }
    } catch (err) {
      alert('网络连接失败，请重试');
    } finally {
      setAddingWeld(false);
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
      const getPhotoStatus = (path) => {
        if (!path) return { isDone: false, label: '未上传', path: null };
        if (path.startsWith('REJECTED:')) {
          return { isDone: false, label: '需重传', path: null };
        }
        return { isDone: true, label: '已上传', path: path };
      };

      const statusZudui = getPhotoStatus(found.photo_zudui);
      const statusDadi = getPhotoStatus(found.photo_dadi);
      const statusGaimian = getPhotoStatus(found.photo_gaimian);

      setUploadedPhotos({
        zudui: statusZudui.path,
        dadi: statusDadi.path,
        gaimian: statusGaimian.path,
      });

      setStatusMsg({
        zudui: statusZudui.label,
        dadi: statusDadi.label,
        gaimian: statusGaimian.label,
      });
    }
  };

  // ─── 照片拍照与直传 OSS 逻辑 ──────────────────────────────
  const triggerCapture = (type) => {
    fileInputRefs[type].current.click();
  };

  const handleCaptureAndUpload = async (type, e) => {
    const file = e.target.files[0];
    if (!file) return;

    const activeWeld = weldsList.find((w) => w.weld_no === selectedWeld);
    if (!activeWeld) {
      alert('选中的焊口数据有误');
      return;
    }

    const weldUuid = activeWeld.uuid;

    // 1. 进入压缩状态
    setIsSubmitting((prev) => ({ ...prev, [type]: true }));

    let blobToSend = file;
    if (compressConfig.enabled) {
      setStatusMsg((prev) => ({ ...prev, [type]: '正在压缩照片...' }));
      try {
        blobToSend = await compressImage(file, compressConfig.maxWidth, compressConfig.maxHeight, compressConfig.quality);
      } catch (err) {
        setStatusMsg((prev) => ({ ...prev, [type]: '压缩失败，请重试' }));
        setIsSubmitting((prev) => ({ ...prev, [type]: false }));
        return;
      }
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
          weld_uuid: weldUuid,
          photo_type: type,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || '获取上传凭证失败');
      }
      signedUrl = data.signedUrl;
      objectKey = data.objectKey;
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: `凭证错误: ${err.message}` }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 3. 前端直传云端 OSS
    setStatusMsg((prev) => ({ ...prev, [type]: '正在上传云存储...' }));
    try {
      const ossResp = await fetch(signedUrl, {
        method: 'PUT',
        body: blobToSend,
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
          weld_uuid: weldUuid,
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
    
    // 重新加载已定位管线的最新焊口列表
    if (selectedPipelineUuid) {
      handleSelectPipelineUuid(selectedPipelineUuid);
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
                  <span className="text-[11px] text-[#0f62fe] block">已定位项目与管线号</span>
                  <span className="text-[14px] font-semibold text-[#161616] block truncate max-w-[400px]">
                    {projectInfo.name} ({projectInfo.constructionNo})
                  </span>
                  <span className="text-[16px] font-mono font-bold text-[#161616] block mt-1">{selectedPipeline}</span>
                </div>
                {!searchParams.get('pipeline_uuid') && (
                  <button
                    onClick={() => {
                      setSelectedPipelineUuid('');
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
                            key={item.pipeline_uuid}
                            onClick={() => handleSelectPipelineUuid(item.pipeline_uuid)}
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

            {/* 2. 焊口号下拉选择区与快捷新增 */}
            {selectedPipeline && (
              <div className="bg-white border border-[#e0e0e0] p-4 rounded-none mb-4 space-y-4">
                <div className="flex flex-col">
                  <span className="text-[12px] text-[#525252] mb-1.5">选择焊口号</span>
                  <select
                    value={selectedWeld}
                    onChange={handleWeldChange}
                    className="w-full h-11 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                  >
                    <option value="">请选择焊口号</option>
                    {weldsList.map((w) => {
                      const isAllDone =
                        w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') &&
                        w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') &&
                        w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:');
                      return (
                        <option key={w.id} value={w.weld_no} disabled={isAllDone}>
                          {w.weld_no} {isAllDone ? '(已完工)' : ''}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 现场新增焊口控件 */}
                <div className="border-t border-[#f4f4f4] pt-4">
                  <span className="text-[12px] text-[#525252] block mb-2">💡 未在图纸中？在现场快速新增焊口：</span>
                  
                  {projectInfo.weldPrefix ? (
                    // 有焊口前缀：提供一键自增创建
                    <button
                      type="button"
                      disabled={addingWeld}
                      onClick={handleAddWeldOnsite}
                      className="w-full h-10 border border-[#0f62fe] bg-white hover:bg-[#edf5ff] text-[#0f62fe] text-[13px] font-medium cursor-pointer rounded-none outline-none disabled:bg-[#f4f4f4] disabled:text-[#8d8d8d] disabled:border-[#e0e0e0]"
                    >
                      {addingWeld ? '正在自动编号...' : `+ 自动生成新增焊口 (格式: ${projectInfo.weldPrefix}-XX)`}
                    </button>
                  ) : (
                    // 没有焊口前缀：提供完全自定义输入框
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWeldName}
                        onChange={(e) => setNewWeldName(e.target.value)}
                        placeholder="输入新焊口号..."
                        disabled={addingWeld}
                        className="flex-1 h-10 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[13px] outline-none focus:border-[#0f62fe] rounded-none disabled:bg-[#f4f4f4]"
                      />
                      <button
                        type="button"
                        disabled={addingWeld}
                        onClick={handleAddWeldOnsite}
                        className="h-10 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] font-medium cursor-pointer rounded-none border-none outline-none disabled:bg-[#8d8d8d]"
                      >
                        {addingWeld ? '新增中...' : '确认新增'}
                      </button>
                    </div>
                  )}
                </div>
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

                  // 检查数据库原始记录中是否存在被驳回的照片
                  const activeWeldRecord = weldsList.find((w) => w.weld_no === selectedWeld);
                  const rawPath = activeWeldRecord ? activeWeldRecord[`photo_${type.id}`] : null;
                  const isRejected = rawPath && rawPath.startsWith('REJECTED:');

                  return (
                    <div
                      key={type.id}
                      className={`border p-4 bg-white rounded-none flex items-center justify-between transition-colors duration-150
                        ${isDone ? 'border-[#24a148]' : isRejected ? 'border-[#da1e28]' : 'border-[#e0e0e0]'}
                      `}
                    >
                      <div className="flex-1 min-w-0 mr-4">
                        <span className="text-[14px] font-semibold text-[#161616] block">{type.name}</span>
                        <span
                          className={`text-[12px] block mt-1 font-mono
                            ${
                              isDone
                                ? 'text-[#24a148]'
                                : isRejected
                                ? 'text-[#da1e28] font-medium animate-pulse'
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

                        {/* 如果被标记不合格，则呈现被驳回照片预览 */}
                        {isRejected && !isDone && (
                          <div className="mt-3">
                            <span className="text-[11px] text-[#da1e28] block mb-1">⚠️ 照片不合格需重传。不合格照片预览：</span>
                            <div className="w-32 h-24 bg-[#f4f4f4] border border-[#da1e28] overflow-hidden flex items-center justify-center">
                              <img
                                src={`/api/photo/preview?path=${encodeURIComponent(rawPath)}`}
                                alt="不合格预览"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
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
                              : isRejected
                              ? 'border-transparent bg-[#da1e28] hover:bg-[#b21922] text-white font-medium'
                              : 'border-transparent bg-[#0f62fe] hover:bg-[#0353e9] text-white font-medium'
                          }
                          disabled:bg-[#8d8d8d] disabled:cursor-not-allowed
                        `}
                      >
                        {isDone ? '重新拍照' : isRejected ? '重传照片' : '拍照上传'}
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
