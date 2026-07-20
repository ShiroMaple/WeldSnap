'use client';

/**
 * 移动端自适应照片上传页面 (V2.0 工业大触控与多层级导航重构版)
 *
 * 特性：
 *   - 符合 IBM Carbon Design System 工业风硬约束（52px+ 触控目标）
 *   - 多层级穿透导航（Level 0 主入口 ➔ Level 1 项目列表 ➔ Level 1.5 管线列表 ➔ Level 2 焊口选择 ➔ Level 3 三工序拍照）
 *   - 焦点 Hero 置顶卡片：记录并一键直达“最近一次打开的项目”
 *   - 扫码直达：扫描包含 pipeline_uuid 的二维码，自动定位至对应管线层级
 *   - 模糊搜索备用入口：方便无二维码时的快速关键字检索
 */

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { compressImage } from '@/lib/compress';
import QRScannerModal from '@/components/QRScannerModal';

const PHOTO_TYPES = [
  { id: 'zudui', name: '1. 组对工序', label: '组对' },
  { id: 'dadi', name: '2. 打底工序', label: '打底' },
  { id: 'gaimian', name: '3. 盖面工序', label: '盖面' },
];

function UploadContent() {
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const searchParams = useSearchParams();

  // ─── 层级导航状态 (0: 主入口, 1: 项目列表, 1.5: 管线列表, 2: 焊口选择, 3: 拍照上传) ─────────
  const [currentLevel, setCurrentLevel] = useState(0);

  // ─── 扫码 Modal 状态 ──────────────────────────────────────────
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  // ─── 数据与选择状态 ───────────────────────────────────────────
  const [projectsList, setProjectsList] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [selectedProject, setSelectedProject] = useState(null); // { uuid, construction_no, project_name, weld_prefix, ... }
  const [pipelinesList, setPipelinesList] = useState([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  const [selectedPipelineUuid, setSelectedPipelineUuid] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState(''); // 管线编号
  const [weldsList, setWeldsList] = useState([]);
  const [selectedWeld, setSelectedWeld] = useState('');

  // 最近一次打开的项目 (LocalStorage 缓存)
  const [recentProject, setRecentProject] = useState(null);

  // 备用搜索框状态
  const [pipelineQuery, setPipelineQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 现场新增焊口状态
  const [newWeldName, setNewWeldName] = useState('');
  const [addingWeld, setAddingWeld] = useState(false);

  // 选中焊口的照片上传状态
  const [uploadedPhotos, setUploadedPhotos] = useState({ zudui: null, dadi: null, gaimian: null });
  const [statusMsg, setStatusMsg] = useState({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });
  const [isSubmitting, setIsSubmitting] = useState({ zudui: false, dadi: false, gaimian: false });
  const [showSuccessPage, setShowSuccessPage] = useState(false);

  // 文件 Input Refs
  const fileInputRefs = {
    zudui: useRef(null),
    dadi: useRef(null),
    gaimian: useRef(null),
  };

  // 图片压缩配置
  const [compressConfig, setCompressConfig] = useState({ enabled: true, maxWidth: 1920, maxHeight: 1080, quality: 0.8 });

  // ─── 页面初始化与认证检查 ──────────────────────────────────────
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

        // 读取 LocalStorage 中的最近项目缓存
        try {
          const cached = localStorage.getItem('weldsnap_last_project');
          if (cached) {
            setRecentProject(JSON.parse(cached));
          }
        } catch {}

        // 拉取项目列表数据
        fetchProjects();

        // 检查 URL 中是否包含扫码直达参数 pipeline_uuid
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

  // 拉取压缩设置
  useEffect(() => {
    fetch('/api/settings/compression')
      .then((r) => r.json())
      .then((data) => { if (data.success) setCompressConfig(data.compression); })
      .catch(() => {});
  }, []);

  // ─── API 请求函数 ─────────────────────────────────────────────
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const resp = await fetch('/api/projects');
      const data = await resp.json();
      if (resp.ok && data.success) {
        // 智能排序：优先最近更新(或创建时间) -> 完成率未完成的排前面 -> 创建时间
        const sorted = (data.projects || []).sort((a, b) => {
          // 比较质量完成度 (未满 100% 的排在前面，优先方便补全)
          if (a.quality_progress !== b.quality_progress) {
            if (a.quality_progress < 100 && b.quality_progress === 100) return -1;
            if (a.quality_progress === 100 && b.quality_progress < 100) return 1;
          }
          return new Date(b.created_at) - new Date(a.created_at);
        });
        setProjectsList(sorted);
      }
    } catch {}
    setLoadingProjects(false);
  };

  const fetchPipelinesOfProject = async (projectUuid) => {
    setLoadingPipelines(true);
    try {
      const resp = await fetch(`/api/pipelines/by-project/${encodeURIComponent(projectUuid)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setPipelinesList(data.pipelines || []);
        setSelectedProject(data.project);
      }
    } catch {}
    setLoadingPipelines(false);
  };

  // ─── 交互处理函数 ─────────────────────────────────────────────
  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch {
      alert('注销失败，请重试');
    }
  };

  // 选择某个项目 (Level 0 -> Level 1.5)
  const handleSelectProject = (project) => {
    setSelectedProject(project);
    // 写入 LocalStorage 缓存“最近一次打开的项目”
    try {
      const cacheObj = {
        uuid: project.uuid,
        construction_no: project.construction_no,
        project_name: project.project_name,
        quality_progress: project.quality_progress || 0,
      };
      localStorage.setItem('weldsnap_last_project', JSON.stringify(cacheObj));
      setRecentProject(cacheObj);
    } catch {}

    fetchPipelinesOfProject(project.uuid);
    setCurrentLevel(1.5);
  };

  // 选中某条管线 (Level 1.5 / 搜索 / 扫码 ➔ Level 2)
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
        setSelectedProject({
          name: data.project_name,
          constructionNo: data.construction_no,
          weldPrefix: data.weld_prefix || '',
        });
        setCurrentLevel(2); // 进入焊口选择/现场新增层级
      } else {
        alert(data.error || '定位管线失败');
        setSelectedPipelineUuid('');
      }
    } catch {
      alert('网络连接错误，无法读取焊口');
      setSelectedPipelineUuid('');
    }
  };

  // 模糊搜索输入框变更
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

  // 现场快捷新增焊口
  const handleAddWeldOnsite = async () => {
    if (!selectedPipelineUuid) return;
    const prefix = selectedProject?.weld_prefix || selectedProject?.weldPrefix;

    if (!prefix && !newWeldName.trim()) {
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
          weld_no: prefix ? '' : newWeldName.trim(),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert(`成功新增焊口: ${data.weld_no}`);
        setNewWeldName('');
        // 重新加载焊口列表并自动选中当前新增焊口
        const listResp = await fetch(`/api/welds/by-pipeline/${encodeURIComponent(selectedPipelineUuid)}`);
        const listData = await listResp.json();
        if (listResp.ok && listData.success) {
          setWeldsList(listData.welds || []);
          handleSelectWeld(data.weld_no, listData.welds || []);
        }
      } else {
        alert(data.error || '新增焊口失败');
      }
    } catch {
      alert('网络连接失败，请重试');
    } finally {
      setAddingWeld(false);
    }
  };

  // 选择某个焊口 (Level 2 ➔ Level 3)
  const handleSelectWeld = (weldNo, list = weldsList) => {
    setSelectedWeld(weldNo);
    if (!weldNo) return;

    const found = list.find((w) => w.weld_no === weldNo);
    if (found) {
      const getPhotoStatus = (path) => {
        if (!path) return { isDone: false, label: '未上传', path: null };
        if (path.startsWith('REJECTED:')) {
          return { isDone: false, label: '需重传', path: null };
        }
        return { isDone: true, label: '已上传', path: path };
      };

      const sZudui = getPhotoStatus(found.photo_zudui);
      const sDadi = getPhotoStatus(found.photo_dadi);
      const sGaimian = getPhotoStatus(found.photo_gaimian);

      setUploadedPhotos({ zudui: sZudui.path, dadi: sDadi.path, gaimian: sGaimian.path });
      setStatusMsg({ zudui: sZudui.label, dadi: sDadi.label, gaimian: sGaimian.label });
    }

    setCurrentLevel(3); // 进入拍照上传层级
  };

  // 拍照与云直传 OSS
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
    setIsSubmitting((prev) => ({ ...prev, [type]: true }));

    let blobToSend = file;
    if (compressConfig.enabled) {
      setStatusMsg((prev) => ({ ...prev, [type]: '正在压缩照片...' }));
      try {
        blobToSend = await compressImage(file, compressConfig.maxWidth, compressConfig.maxHeight, compressConfig.quality);
      } catch {
        setStatusMsg((prev) => ({ ...prev, [type]: '压缩失败，请重试' }));
        setIsSubmitting((prev) => ({ ...prev, [type]: false }));
        return;
      }
    }

    // 获取预签名 URL
    setStatusMsg((prev) => ({ ...prev, [type]: '获取上传凭证...' }));
    let signedUrl, objectKey;
    try {
      const resp = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weld_uuid: weldUuid, photo_type: type }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) throw new Error(data.error || '获取凭证失败');
      signedUrl = data.signedUrl;
      objectKey = data.objectKey;
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: `凭证错误: ${err.message}` }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 直传 OSS
    setStatusMsg((prev) => ({ ...prev, [type]: '正在上传云存储...' }));
    try {
      const ossResp = await fetch(signedUrl, {
        method: 'PUT',
        body: blobToSend,
        headers: { 'Content-Type': 'image/jpeg' },
      });
      if (ossResp.status !== 200) throw new Error('直传 OSS 被拒绝');
    } catch {
      setStatusMsg((prev) => ({ ...prev, [type]: '云端直传失败，请重试' }));
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      return;
    }

    // 回写确认
    setStatusMsg((prev) => ({ ...prev, [type]: '正在同步回写...' }));
    try {
      const confirmResp = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weld_uuid: weldUuid, photo_type: type, objectKey }),
      });
      const confirmData = await confirmResp.json();
      if (confirmResp.ok && confirmData.success) {
        setUploadedPhotos((prev) => ({ ...prev, [type]: objectKey }));
        setStatusMsg((prev) => ({ ...prev, [type]: '已上传' }));
      } else {
        throw new Error(confirmData.error || '数据库回写错误');
      }
    } catch (err) {
      setStatusMsg((prev) => ({ ...prev, [type]: `确认失败: ${err.message}` }));
    } finally {
      setIsSubmitting((prev) => ({ ...prev, [type]: false }));
      e.target.value = '';
    }
  };

  const handleSubmitAll = () => {
    setShowSuccessPage(true);
  };

  const handleResetForm = () => {
    setShowSuccessPage(false);
    setSelectedWeld('');
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });
    setCurrentLevel(2); // 返回当前管线的焊口选择层
    if (selectedPipelineUuid) {
      handleSelectPipelineUuid(selectedPipelineUuid);
    }
  };

  const allPhotosUploaded = uploadedPhotos.zudui && uploadedPhotos.dadi && uploadedPhotos.gaimian;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] font-mono text-[#525252] text-[14px]">
        [WeldSnap] 正在加载移动端工作台...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] p-4 font-sans select-none max-w-[600px] mx-auto flex flex-col justify-between">
      {/* 头部条与常驻返回上一层按键 */}
      <header className="flex items-center justify-between border-b border-[#e0e0e0] pb-3 mb-4 bg-[#f4f4f4] sticky top-0 z-[100]">
        <div className="flex items-center space-x-2">
          {currentLevel > 0 && (
            <button
              type="button"
              onClick={() => {
                if (currentLevel === 3) setCurrentLevel(2);
                else if (currentLevel === 2) setCurrentLevel(1.5);
                else if (currentLevel === 1.5) setCurrentLevel(1);
                else setCurrentLevel(0);
              }}
              className="h-10 px-3 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center"
            >
              ‹ 返回
            </button>
          )}
          <div>
            <h1 className="text-[17px] font-semibold text-[#161616]">
              {currentLevel === 0 && '照片录入中心'}
              {currentLevel === 1 && '选取项目'}
              {currentLevel === 1.5 && '选取管线'}
              {currentLevel === 2 && '选择焊口与新增'}
              {currentLevel === 3 && '工序照片上传'}
            </h1>
            <span className="text-[11px] text-[#525252] block">
              当前操作员: {currentUser.display_name || currentUser.username}
            </span>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="text-[#da1e28] text-[13px] hover:underline bg-transparent border-none cursor-pointer outline-none"
        >
          退出
        </button>
      </header>

      {/* 面包屑导航指示器 */}
      {currentLevel > 0 && (
        <div className="bg-white border border-[#e0e0e0] p-2.5 mb-4 text-[12px] text-[#525252] font-mono flex items-center overflow-x-auto whitespace-nowrap">
          <span className="cursor-pointer hover:underline text-[#0f62fe]" onClick={() => setCurrentLevel(0)}>首页</span>
          {selectedProject && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span className="cursor-pointer hover:underline text-[#0f62fe]" onClick={() => setCurrentLevel(1.5)}>
                {selectedProject.construction_no || selectedProject.constructionNo}
              </span>
            </>
          )}
          {selectedPipeline && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span className="cursor-pointer hover:underline text-[#0f62fe]" onClick={() => setCurrentLevel(2)}>
                {selectedPipeline}
              </span>
            </>
          )}
          {selectedWeld && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span className="font-bold text-[#161616]">{selectedWeld}</span>
            </>
          )}
        </div>
      )}

      {/* 提交成功提示页 */}
      {showSuccessPage ? (
        <div className="flex-1 flex flex-col items-center justify-center py-12 text-center bg-white border border-[#e0e0e0] p-6 shadow-none">
          <span className="text-[64px] text-[#24a148] mb-4">✓</span>
          <h2 className="text-[20px] font-light text-[#161616] mb-2">三工序录入已成功归档</h2>
          <p className="text-[13px] text-[#525252] max-w-[320px] leading-relaxed mb-8">
            管线号 <span className="font-mono font-semibold text-[#161616]">{selectedPipeline}</span> - 焊口号 <span className="font-mono font-semibold text-[#161616]">{selectedWeld}</span> 的组对、打底、盖面三张质量照片已直传云端归档。
          </p>
          <button
            onClick={handleResetForm}
            className="w-full h-13 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[15px] font-medium cursor-pointer rounded-none border-none outline-none"
          >
            继续录入下一个焊口
          </button>
        </div>
      ) : (
        <div className="flex-1 flex flex-col justify-between space-y-4">
          
          {/* ════════════════ LEVEL 0: 移动端主入口 ════════════════ */}
          {currentLevel === 0 && (
            <div className="space-y-5">
              {/* 主要入口：大触控按键区（52px+ 工业规格） */}
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => setIsQRModalOpen(true)}
                  className="w-full h-15 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[16px] font-semibold flex items-center justify-center space-x-2 rounded-none border-none cursor-pointer shadow-none transition-colors duration-150"
                >
                  <span className="text-[22px]">📷</span>
                  <span>扫码定位管线号 (快捷拍照)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fetchProjects();
                    setCurrentLevel(1);
                  }}
                  className="w-full h-14 bg-white hover:bg-[#edf5ff] border-2 border-[#0f62fe] text-[#0f62fe] text-[15px] font-semibold flex items-center justify-center space-x-2 rounded-none cursor-pointer transition-colors duration-150"
                >
                  <span className="text-[20px]">📁</span>
                  <span>按项目列表选取管线</span>
                </button>
              </div>

              {/* 焦点 Hero 置顶卡片：最近一次打开的项目 */}
              {recentProject && (
                <div className="bg-[#edf5ff] border border-[#0f62fe] p-4 rounded-none">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-bold text-[#0f62fe] uppercase tracking-wider">最近一次打开的项目</span>
                    <span className="text-[12px] font-mono text-[#0f62fe] font-semibold">{recentProject.quality_progress}% 完成</span>
                  </div>
                  <h3 className="text-[15px] font-semibold text-[#161616] truncate">
                    {recentProject.project_name} ({recentProject.construction_no})
                  </h3>
                  
                  {/* 进度条 */}
                  <div className="w-full bg-[#c6c6c6] h-2 my-2.5">
                    <div className="bg-[#0f62fe] h-2 transition-all duration-300" style={{ width: `${recentProject.quality_progress || 0}%` }} />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      fetchPipelinesOfProject(recentProject.uuid);
                      setCurrentLevel(1.5);
                    }}
                    className="w-full h-11 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] font-medium cursor-pointer rounded-none border-none outline-none mt-1"
                  >
                    一键继续该项目 ➔
                  </button>
                </div>
              )}

              {/* 次要备用入口：输入搜索框 */}
              <div className="bg-white border border-[#e0e0e0] p-4 rounded-none space-y-2">
                <span className="text-[12px] text-[#525252] block font-medium">🔍 次要入口：按管线号关键字搜索</span>
                <div className="relative">
                  <input
                    type="text"
                    value={pipelineQuery}
                    onChange={handleSearchInputChange}
                    placeholder="输入管线号搜索过滤..."
                    className="w-full h-12 px-4 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
                  />
                  {showSearchResults && (
                    <div className="absolute top-[50px] left-0 right-0 border border-[#e0e0e0] bg-white max-h-[220px] overflow-y-auto z-[9999]">
                      {searchResults.length === 0 ? (
                        <div className="p-3 text-[13px] text-[#8d8d8d] text-center">无匹配管线</div>
                      ) : (
                        searchResults.map((item) => (
                          <div
                            key={item.pipeline_uuid}
                            onClick={() => handleSelectPipelineUuid(item.pipeline_uuid)}
                            className="p-3 border-b border-[#f4f4f4] last:border-b-0 cursor-pointer hover:bg-[#edf5ff] text-[13px]"
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
            </div>
          )}

          {/* ════════════════ LEVEL 1: 项目选取列表 ════════════════ */}
          {currentLevel === 1 && (
            <div className="space-y-3">
              <span className="text-[12px] text-[#525252] block mb-1">请点击选择要进行工序照片录入的施工项目：</span>
              
              {loadingProjects ? (
                <div className="p-8 text-center text-[#525252] font-mono text-[13px] bg-white border border-[#e0e0e0]">
                  加载项目中...
                </div>
              ) : projectsList.length === 0 ? (
                <div className="p-8 text-center text-[#8d8d8d] text-[13px] bg-white border border-[#e0e0e0]">
                  暂无可用的项目
                </div>
              ) : (
                projectsList.map((p) => (
                  <div
                    key={p.uuid}
                    onClick={() => handleSelectProject(p)}
                    className="bg-white border border-[#e0e0e0] hover:border-[#0f62fe] p-4 cursor-pointer transition-colors duration-150 flex flex-col justify-between"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[12px] font-mono text-[#0f62fe] font-semibold block">{p.construction_no}</span>
                        <h4 className="text-[15px] font-semibold text-[#161616] mt-0.5">{p.project_name}</h4>
                      </div>
                      <span className="text-[12px] font-mono font-bold text-[#161616]">
                        {p.quality_progress}%
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-[#525252]">
                      <span>包含 {p.pipeline_count} 条管线 / {p.weld_count} 口焊接</span>
                      <span className="font-mono text-[#8d8d8d]">{p.status}</span>
                    </div>

                    {/* 完成率进度条 */}
                    <div className="w-full bg-[#e0e0e0] h-1.5 mt-2">
                      <div
                        className={`h-1.5 transition-all duration-300 ${p.quality_progress === 100 ? 'bg-[#24a148]' : 'bg-[#0f62fe]'}`}
                        style={{ width: `${p.quality_progress || 0}%` }}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ════════════════ LEVEL 1.5: 管线选取列表 ════════════════ */}
          {currentLevel === 1.5 && (
            <div className="space-y-3">
              <div className="bg-[#edf5ff] border border-[#0f62fe] p-3 text-[13px]">
                <span className="text-[11px] text-[#0f62fe] block">已选项目</span>
                <span className="font-semibold text-[#161616]">
                  {selectedProject?.project_name} ({selectedProject?.construction_no})
                </span>
              </div>

              <span className="text-[12px] text-[#525252] block">请选择目标管线号：</span>

              {loadingPipelines ? (
                <div className="p-8 text-center text-[#525252] font-mono text-[13px] bg-white border border-[#e0e0e0]">
                  加载管线列表中...
                </div>
              ) : pipelinesList.length === 0 ? (
                <div className="p-8 text-center text-[#8d8d8d] text-[13px] bg-white border border-[#e0e0e0]">
                  该项目暂未添加管线号
                </div>
              ) : (
                pipelinesList.map((pl) => (
                  <div
                    key={pl.uuid}
                    onClick={() => handleSelectPipelineUuid(pl.uuid)}
                    className="bg-white border border-[#e0e0e0] hover:border-[#0f62fe] p-4 cursor-pointer transition-colors duration-150 flex items-center justify-between min-h-[58px]"
                  >
                    <div>
                      <span className="text-[15px] font-mono font-bold text-[#161616] block">{pl.pipeline_no}</span>
                      <span className="text-[11px] text-[#525252]">
                        共 {pl.weld_count} 个焊口 / 已归档完工 {pl.completed} 个
                      </span>
                    </div>

                    <span className="text-[13px] text-[#0f62fe] font-medium">选择 ➔</span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ════════════════ LEVEL 2: 焊口选择与现场新增 ════════════════ */}
          {currentLevel === 2 && (
            <div className="space-y-4">
              <div className="bg-[#edf5ff] border border-[#0f62fe] p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-[#0f62fe] block">当前定位管线号</span>
                  <span className="text-[17px] font-mono font-bold text-[#161616]">{selectedPipeline}</span>
                  <span className="text-[12px] text-[#525252] block mt-0.5">
                    {selectedProject?.name || selectedProject?.project_name} ({selectedProject?.constructionNo || selectedProject?.construction_no})
                  </span>
                </div>
                <button
                  onClick={() => setCurrentLevel(1.5)}
                  className="text-[13px] text-[#0f62fe] hover:underline bg-transparent border-none cursor-pointer outline-none"
                >
                  切换管线
                </button>
              </div>

              {/* 焊口选择列表 (52px 触控下拉框与卡片) */}
              <div className="bg-white border border-[#e0e0e0] p-4 space-y-4">
                <span className="text-[13px] text-[#525252] font-semibold block">选择已有焊口号：</span>
                <select
                  value={selectedWeld}
                  onChange={(e) => handleSelectWeld(e.target.value)}
                  className="w-full h-13 px-4 bg-white border border-[#c6c6c6] text-[#161616] text-[15px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                >
                  <option value="">-- 请选择焊口号进入拍照 --</option>
                  {weldsList.map((w) => {
                    const isAllDone =
                      w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') &&
                      w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') &&
                      w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:');
                    return (
                      <option key={w.id} value={w.weld_no} disabled={isAllDone}>
                        {w.weld_no} {isAllDone ? '(已完工归档)' : ''}
                      </option>
                    );
                  })}
                </select>

                {/* 现场新增焊口控件 */}
                <div className="border-t border-[#f4f4f4] pt-4 space-y-2">
                  <span className="text-[12px] text-[#525252] block">💡 未在图纸清单中？在现场快速新增焊口：</span>
                  
                  {(selectedProject?.weld_prefix || selectedProject?.weldPrefix) ? (
                    <button
                      type="button"
                      disabled={addingWeld}
                      onClick={handleAddWeldOnsite}
                      className="w-full h-12 border-2 border-[#0f62fe] bg-white hover:bg-[#edf5ff] text-[#0f62fe] text-[14px] font-semibold cursor-pointer rounded-none outline-none disabled:bg-[#f4f4f4] disabled:text-[#8d8d8d]"
                    >
                      {addingWeld ? '正在生成编号...' : `+ 自动生成新焊口 (${selectedProject.weld_prefix || selectedProject.weldPrefix}-XX)`}
                    </button>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newWeldName}
                        onChange={(e) => setNewWeldName(e.target.value)}
                        placeholder="输入新焊口编号..."
                        disabled={addingWeld}
                        className="flex-1 h-12 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none"
                      />
                      <button
                        type="button"
                        disabled={addingWeld}
                        onClick={handleAddWeldOnsite}
                        className="h-12 px-5 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[13px] font-medium cursor-pointer rounded-none border-none outline-none disabled:bg-[#8d8d8d]"
                      >
                        {addingWeld ? '新增中...' : '确认新增'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ════════════════ LEVEL 3: 三工序拍照上传 ════════════════ */}
          {currentLevel === 3 && selectedWeld && (
            <div className="space-y-4">
              <div className="bg-[#edf5ff] border border-[#0f62fe] p-3 text-[13px]">
                <span className="text-[11px] text-[#0f62fe] block">正在录入照片焊口</span>
                <span className="text-[16px] font-mono font-bold text-[#161616]">{selectedPipeline} - {selectedWeld}</span>
              </div>

              <div className="space-y-4">
                {PHOTO_TYPES.map((type) => {
                  const path = uploadedPhotos[type.id];
                  const msg = statusMsg[type.id];
                  const loadingState = isSubmitting[type.id];
                  const isDone = !!path;

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
                      <div className="flex-1 min-w-0 mr-3">
                        <span className="text-[15px] font-semibold text-[#161616] block">{type.name}</span>
                        <span
                          className={`text-[12px] block mt-1 font-mono
                            ${
                              isDone
                                ? 'text-[#24a148] font-semibold'
                                : isRejected
                                ? 'text-[#da1e28] font-semibold animate-pulse'
                                : loadingState
                                ? 'text-[#0f62fe] font-medium'
                                : 'text-[#8d8d8d]'
                            }
                          `}
                        >
                          状态: {msg}
                        </span>

                        {/* 成功预览 */}
                        {isDone && (
                          <div className="mt-3 w-32 h-24 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-center">
                            <img
                              src={`/api/photo/preview?path=${encodeURIComponent(path)}`}
                              alt={type.label}
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                        )}

                        {/* 被驳回警告预览 */}
                        {isRejected && !isDone && (
                          <div className="mt-3">
                            <span className="text-[11px] text-[#da1e28] block mb-1">⚠️ 该工序不合格需重传，被驳回原图：</span>
                            <div className="w-32 h-24 bg-[#f4f4f4] border border-[#da1e28] flex items-center justify-center">
                              <img
                                src={`/api/photo/preview?path=${encodeURIComponent(rawPath)}`}
                                alt="不合格预览"
                                className="max-w-full max-h-full object-contain"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      <input
                        type="file"
                        ref={fileInputRefs[type.id]}
                        accept="image/*"
                        capture="environment"
                        onChange={(e) => handleCaptureAndUpload(type.id, e)}
                        className="hidden"
                      />

                      <button
                        type="button"
                        onClick={() => triggerCapture(type.id)}
                        disabled={loadingState}
                        className={`h-13 px-4 text-[13px] font-semibold cursor-pointer rounded-none outline-none border transition-colors duration-150 flex items-center justify-center
                          ${
                            isDone
                              ? 'border-[#c6c6c6] bg-white hover:bg-[#f4f4f4] text-[#161616]'
                              : isRejected
                              ? 'border-transparent bg-[#da1e28] hover:bg-[#b21922] text-white'
                              : 'border-transparent bg-[#0f62fe] hover:bg-[#0353e9] text-white'
                          }
                          disabled:bg-[#8d8d8d] disabled:cursor-not-allowed
                        `}
                      >
                        {isDone ? '重新拍照' : isRejected ? '重传照片' : '📷 拍照上传'}
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* 提交完成控制台 */}
              <div className="pt-4">
                <button
                  type="button"
                  onClick={handleSubmitAll}
                  disabled={!allPhotosUploaded}
                  className="w-full h-14 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[15px] font-semibold transition-colors duration-150 rounded-none border-none outline-none disabled:bg-[#8d8d8d] disabled:cursor-not-allowed cursor-pointer"
                >
                  {allPhotosUploaded ? '✓ 确认并完成此焊口提交' : '请先完成组对、打底、盖面三道工序拍照'}
                </button>
              </div>
            </div>
          )}

        </div>
      )}

      {/* 实时扫码 Modal */}
      <QRScannerModal
        isOpen={isQRModalOpen}
        onClose={() => setIsQRModalOpen(false)}
        onScanSuccess={(scannedUuid) => {
          handleSelectPipelineUuid(scannedUuid);
        }}
      />
    </main>
  );
}

export default function UploadPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] font-mono text-[#525252] text-[14px]">[WeldSnap] 正在初始化工作台...</div>}>
      <UploadContent />
    </Suspense>
  );
}
