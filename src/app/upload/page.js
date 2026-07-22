'use client';

/**
 * 移动端自适应照片上传页面 (V2.2 极简三列工序卡片与顺序切换版)
 *
 * 特性：
 *   - Header 搜索框集成于退出按钮左侧
 *   - 项目列表直接平铺展示在 Level 0 主入口层
 *   - 焊口列表使用带“⚠️ 不合格”优先置顶、“✓ 已拍摄”置底的触控卡片
 *   - Level 3 工序卡片重构为【三列布局】：
 *       - 最左列：工序名称与当前状态
 *       - 中间列：照片预览图（已上传缩略图/不合格原图/暂无照片占位框）
 *       - 最右列：大触控拍照/重拍按钮
 *   - 移除冗余的提交按钮，替换为按名称顺序切换的【上一个焊口】与【下一个焊口】按钮
 *       - 边界拦截：列表首尾自动变为“已是第一个焊口” / “已是最后一个焊口”并禁用
 */

import { useState, useEffect, useRef, useMemo, Suspense } from 'react';
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

  // ─── 层级导航状态 (0: 主入口&项目列表, 1.5: 管线列表, 2: 焊口列表与新增, 3: 拍照上传) ─────────
  const [currentLevel, setCurrentLevel] = useState(0);

  // ─── 扫码 Modal 状态 ──────────────────────────────────────────
  const [isQRModalOpen, setIsQRModalOpen] = useState(false);

  // ─── 数据与选择状态 ───────────────────────────────────────────
  const [projectsList, setProjectsList] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  const [selectedProject, setSelectedProject] = useState(null);
  const [pipelinesList, setPipelinesList] = useState([]);
  const [loadingPipelines, setLoadingPipelines] = useState(false);

  const [selectedPipelineUuid, setSelectedPipelineUuid] = useState('');
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [weldsList, setWeldsList] = useState([]);
  const [selectedWeld, setSelectedWeld] = useState('');

  // 最近一次打开的项目 (LocalStorage 缓存)
  const [recentProject, setRecentProject] = useState(null);

  // Header 搜索框状态
  const [pipelineQuery, setPipelineQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showSearchResults, setShowSearchResults] = useState(false);

  // 现场新增/搜索焊口状态
  const [newWeldName, setNewWeldName] = useState('');
  const [weldSearchTerm, setWeldSearchTerm] = useState('');
  const [addingWeld, setAddingWeld] = useState(false);

  // 选中焊口的照片上传状态
  const [uploadedPhotos, setUploadedPhotos] = useState({ zudui: null, dadi: null, gaimian: null });
  const [statusMsg, setStatusMsg] = useState({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });
  const [isSubmitting, setIsSubmitting] = useState({ zudui: false, dadi: false, gaimian: false });

  // 文件 Input Refs
  const fileInputRefs = {
    zudui: useRef(null),
    dadi: useRef(null),
    gaimian: useRef(null),
  };

  // 图片压缩配置
  const [compressConfig, setCompressConfig] = useState({ enabled: true, maxWidth: 1920, maxHeight: 1080, quality: 0.8 });

  // ─── 移动端浏览器返回按键 (popstate) 与层级导航绑定 ────────────────
  const isPopStateNav = useRef(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.history.replaceState({ level: 0 }, '', window.location.pathname);
    } catch { }

    const handlePopState = (e) => {
      isPopStateNav.current = true;
      const targetLevel = (e.state && typeof e.state.level === 'number') ? e.state.level : 0;
      setCurrentLevel(targetLevel);
      setTimeout(() => {
        isPopStateNav.current = false;
      }, 50);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  // 统一层级切换包装函数 (自动向 history 压栈)
  const navigateToLevel = (newLevel) => {
    if (!isPopStateNav.current && typeof window !== 'undefined') {
      try {
        if (newLevel !== currentLevel) {
          window.history.pushState({ level: newLevel }, '', window.location.pathname);
        }
      } catch { }
    }
    setCurrentLevel(newLevel);
  };

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
        } catch { }

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
      .catch(() => { });
  }, []);

  // ─── API 请求函数 ─────────────────────────────────────────────
  const fetchProjects = async () => {
    setLoadingProjects(true);
    try {
      const resp = await fetch('/api/projects');
      const data = await resp.json();
      if (resp.ok && data.success) {
        const sorted = (data.projects || []).sort((a, b) => {
          if (a.quality_progress !== b.quality_progress) {
            if (a.quality_progress < 100 && b.quality_progress === 100) return -1;
            if (a.quality_progress === 100 && b.quality_progress < 100) return 1;
          }
          return new Date(b.created_at) - new Date(a.created_at);
        });
        setProjectsList(sorted);
      }
    } catch { }
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
    } catch { }
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

  // 选择某个项目 (Level 0 ➔ Level 1)
  const handleSelectProject = (project) => {
    setSelectedProject(project);
    try {
      const cacheObj = {
        uuid: project.uuid,
        construction_no: project.construction_no,
        project_name: project.project_name,
        quality_progress: project.quality_progress || 0,
      };
      localStorage.setItem('weldsnap_last_project', JSON.stringify(cacheObj));
      setRecentProject(cacheObj);
    } catch { }

    fetchPipelinesOfProject(project.uuid);
    navigateToLevel(1);
  };

  // 选中某条管线 (Level 1.5 / 搜索 / 扫码 ➔ Level 2)
  const handleSelectPipelineUuid = async (pipelineUuid) => {
    setSelectedPipelineUuid(pipelineUuid);
    setShowSearchResults(false);
    setPipelineQuery('');
    setWeldsList([]);
    setSelectedWeld('');
    setNewWeldName('');
    setWeldSearchTerm('');
    setUploadedPhotos({ zudui: null, dadi: null, gaimian: null });
    setStatusMsg({ zudui: '未上传', dadi: '未上传', gaimian: '未上传' });

    try {
      const resp = await fetch(`/api/welds/by-pipeline/${encodeURIComponent(pipelineUuid)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setSelectedPipeline(data.pipeline_no);
        setWeldsList(data.welds || []);

        const projectObj = {
          uuid: data.project_uuid,
          project_name: data.project_name,
          construction_no: data.construction_no,
          weld_prefix: data.weld_prefix || '',
          name: data.project_name,
          constructionNo: data.construction_no,
          weldPrefix: data.weld_prefix || '',
        };
        setSelectedProject(projectObj);

        // 如果用户从扫码或搜索调起，预先加载该项目的管线列表，以便返回/切换时正常呈现
        if (data.project_uuid) {
          fetchPipelinesOfProject(data.project_uuid);
        }

        setCurrentLevel(2);
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
    } catch { }
  };

  // 现场快捷新增焊口 (与 PC 端逻辑一致)
  const handleAddWeldOnsite = async () => {
    if (!selectedPipelineUuid) return;
    const prefix = selectedProject?.weld_prefix || selectedProject?.weldPrefix;
    const customName = newWeldName.trim();

    // 如果未填写自定义名称，且未预设项目前缀，则给出提示
    if (!customName && !prefix) {
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
          weld_no: customName, // 优先以输入框填写的名称创建，若为空则由后端按预设前缀自增
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert(`成功新增焊口: ${data.weld_no}`);
        setNewWeldName('');
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

    navigateToLevel(3);
  };

  // 焊口列表智能排序：1. 不合格优先 2. 待拍摄/进行中 3. 已完工排最后
  const sortedWeldsList = useMemo(() => {
    return [...weldsList].sort((a, b) => {
      const getPriority = (w) => {
        const isRejected =
          (w.photo_zudui && w.photo_zudui.startsWith('REJECTED:')) ||
          (w.photo_dadi && w.photo_dadi.startsWith('REJECTED:')) ||
          (w.photo_gaimian && w.photo_gaimian.startsWith('REJECTED:'));
        if (isRejected) return 1;

        const isDone =
          w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') &&
          w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') &&
          w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:');
        if (isDone) return 3;

        return 2;
      };

      const pA = getPriority(a);
      const pB = getPriority(b);
      if (pA !== pB) return pA - pB;

      return a.weld_no.localeCompare(b.weld_no, undefined, { numeric: true });
    });
  }, [weldsList]);

  // 根据当前模糊搜索条件过滤焊口列表
  const filteredWeldsList = useMemo(() => {
    if (!weldSearchTerm) return sortedWeldsList;
    const term = weldSearchTerm.trim().toLowerCase();
    return sortedWeldsList.filter((w) =>
      (w.weld_no || '').toLowerCase().includes(term)
    );
  }, [sortedWeldsList, weldSearchTerm]);

  // 按焊口名称自然顺序排序（用于上一个/下一个焊口顺序切换）
  const nameSortedWelds = useMemo(() => {
    return [...weldsList].sort((a, b) =>
      a.weld_no.localeCompare(b.weld_no, undefined, { numeric: true })
    );
  }, [weldsList]);

  // 当前焊口在名称顺序列表中的索引
  const currentWeldIndex = useMemo(() => {
    return nameSortedWelds.findIndex((w) => w.weld_no === selectedWeld);
  }, [nameSortedWelds, selectedWeld]);

  const hasPrevWeld = currentWeldIndex > 0;
  const hasNextWeld = currentWeldIndex >= 0 && currentWeldIndex < nameSortedWelds.length - 1;

  const handlePrevWeld = () => {
    if (hasPrevWeld) {
      const targetWeld = nameSortedWelds[currentWeldIndex - 1];
      handleSelectWeld(targetWeld.weld_no, weldsList);
    }
  };

  const handleNextWeld = () => {
    if (hasNextWeld) {
      const targetWeld = nameSortedWelds[currentWeldIndex + 1];
      handleSelectWeld(targetWeld.weld_no, weldsList);
    }
  };

  // 焊口 Badge 生成辅助函数
  const getWeldBadge = (w) => {
    const isRejected =
      (w.photo_zudui && w.photo_zudui.startsWith('REJECTED:')) ||
      (w.photo_dadi && w.photo_dadi.startsWith('REJECTED:')) ||
      (w.photo_gaimian && w.photo_gaimian.startsWith('REJECTED:'));

    if (isRejected) {
      return { type: 'rejected', label: '⚠️ 不合格', bg: 'bg-[#da1e28]', text: 'text-white' };
    }

    const completedCount =
      (w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') ? 1 : 0) +
      (w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') ? 1 : 0) +
      (w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:') ? 1 : 0);

    if (completedCount === 3) {
      return { type: 'completed', label: '✓ 已拍摄', bg: 'bg-[#24a148]', text: 'text-white' };
    }

    if (completedCount > 0) {
      return { type: 'progress', label: `进行中 (${completedCount}/3)`, bg: 'bg-[#edf5ff]', text: 'text-[#0f62fe] border border-[#0f62fe]' };
    }

    return { type: 'pending', label: '待拍摄', bg: 'bg-[#f4f4f4]', text: 'text-[#525252] border border-[#c6c6c6]' };
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
        // 重新刷新下属焊口数据以同步父级列表中已拍摄状态
        if (selectedPipelineUuid) {
          fetch(`/api/welds/by-pipeline/${encodeURIComponent(selectedPipelineUuid)}`)
            .then((r) => r.json())
            .then((d) => { if (d.success) setWeldsList(d.welds || []); })
            .catch(() => { });
        }
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] text-[#525252] text-[14px]">
        [WeldSnap] 正在加载移动端工作台...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#f4f4f4] p-3.5 sm:p-4 font-sans select-none max-w-[600px] w-full mx-auto flex flex-col justify-between overflow-x-hidden">
      {/* 头部条：搜索功能集成于退出按钮左侧 */}
      <header className="flex items-center justify-between border-b border-[#e0e0e0] pb-2.5 mb-3 bg-[#f4f4f4] sticky top-0 z-[100] gap-1.5 w-full">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          {currentLevel > 0 && (
            <button
              type="button"
              onClick={() => {
                if (currentLevel === 3) navigateToLevel(2);
                else if (currentLevel === 2) navigateToLevel(1);
                else navigateToLevel(0);
              }}
              className="h-10 px-5 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center flex-shrink-0"
            >
              ‹ 返回
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-[15px] font-semibold text-[#161616] truncate leading-snug">
              {currentLevel === 0 && '照片录入'}
              {currentLevel === 1 && '选择管线'}
              {currentLevel === 2 && '选择焊口'}
              {currentLevel === 3 && '工序照片上传'}
            </h1>
            <span className="text-[10px] text-[#525252] block truncate">
              {currentUser.display_name || currentUser.username}
            </span>
          </div>
        </div>

        {/* 顶部搜索框 + 退出按钮 */}
        <div className="flex items-center space-x-2 flex-shrink-0">
          <div className="relative w-[130px] sm:w-[160px]">
            <input
              type="text"
              value={pipelineQuery}
              onChange={handleSearchInputChange}
              placeholder="🔍 搜索管线号..."
              className="w-full h-8 px-2 bg-white border border-[#c6c6c6] text-[#161616] text-[14px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
            />
            {showSearchResults && (
              <div className="absolute top-[34px] right-0 w-[220px] border border-[#e0e0e0] bg-white max-h-[220px] overflow-y-auto z-[9999] shadow-lg">
                {searchResults.length === 0 ? (
                  <div className="p-3 text-[12px] text-[#8d8d8d] text-center">无匹配管线</div>
                ) : (
                  searchResults.map((item) => (
                    <div
                      key={item.pipeline_uuid}
                      onClick={() => handleSelectPipelineUuid(item.pipeline_uuid)}
                      className="p-2.5 border-b border-[#f4f4f4] last:border-b-0 cursor-pointer hover:bg-[#edf5ff] text-[12px]"
                    >
                      <span className="font-semibold text-[#161616] block">{item.pipeline_no}</span>
                      <span className="text-[11px] text-[#8d8d8d] block truncate">{item.project_name} | {item.construction_no}</span>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          <button
            onClick={handleLogout}
            className="text-[#da1e28] text-[12px] hover:underline bg-transparent border-none cursor-pointer outline-none whitespace-nowrap flex-shrink-0"
          >
            退出
          </button>
        </div>
      </header>

      {/* 面包屑导航指示器 (与当前层级 currentLevel 严格联动) */}
      {currentLevel > 0 && (
        <div className="bg-white border border-[#e0e0e0] p-2.5 mb-4 text-[25px] text-[#525252] flex items-center overflow-x-auto whitespace-nowrap">
          <span
            className={`cursor-pointer hover:underline ${currentLevel === 0 ? 'font-bold text-[#161616]' : 'text-[#0f62fe]'}`}
            onClick={() => navigateToLevel(0)}
          >
            首页
          </span>

          {currentLevel >= 1 && selectedProject && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span
                className={`cursor-pointer hover:underline ${currentLevel === 1 ? 'font-bold text-[#161616]' : 'text-[#0f62fe]'}`}
                onClick={() => navigateToLevel(1)}
              >
                {selectedProject.construction_no || selectedProject.constructionNo || selectedProject.project_name}
              </span>
            </>
          )}

          {currentLevel >= 2 && selectedPipeline && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span
                className={`cursor-pointer hover:underline ${currentLevel === 2 ? 'font-bold text-[#161616]' : 'text-[#0f62fe]'}`}
                onClick={() => navigateToLevel(2)}
              >
                {selectedPipeline}
              </span>
            </>
          )}

          {currentLevel === 3 && selectedWeld && (
            <>
              <span className="mx-1 text-[#8d8d8d]">/</span>
              <span className="font-bold text-[#161616]">{selectedWeld}</span>
            </>
          )}
        </div>
      )}

      <div className="flex-1 flex flex-col justify-between space-y-4">

        {/* ════════════════ LEVEL 0: 主入口与合并项目列表 ════════════════ */}
        {currentLevel === 0 && (
          <div className="space-y-5">
            {/* 主要动作：扫码定位管线号大按键 */}
            <button
              type="button"
              onClick={() => setIsQRModalOpen(true)}
              className="w-full h-15 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[16px] font-semibold flex items-center justify-center space-x-2 rounded-none border-none cursor-pointer shadow-none transition-colors duration-150"
            >
              <span className="text-[22px]">📷</span>
              <span>扫码定位管线号</span>
            </button>

            {/* 焦点 Hero 置顶卡片：最近一次打开的项目 */}
            {recentProject && (
              <div className="bg-[#edf5ff] border border-[#0f62fe] p-4 rounded-none">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-bold text-[#0f62fe] uppercase tracking-wider">最近一次打开的项目</span>
                  <span className="text-[12px] text-[#0f62fe] font-semibold">{recentProject.quality_progress}% 完成</span>
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
                    navigateToLevel(1);
                  }}
                  className="w-full h-11 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] font-medium cursor-pointer rounded-none border-none outline-none mt-1"
                >
                  继续该项目 ➔
                </button>
              </div>
            )}

            {/* 直接平铺展示：施工项目列表 */}
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-[#e0e0e0] pb-2">
                <h3 className="text-[14px] font-semibold text-[#161616]">📁 施工项目列表</h3>
                <span className="text-[11px] text-[#525252]">点击选择管线</span>
              </div>

              {loadingProjects ? (
                <div className="p-8 text-center text-[#525252] text-[13px] bg-white border border-[#e0e0e0]">
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
                        <span className="text-[12px] text-[#0f62fe] font-semibold block">{p.construction_no}</span>
                        <h4 className="text-[15px] font-semibold text-[#161616] mt-0.5">{p.project_name}</h4>
                      </div>
                      <span className="text-[12px] font-bold text-[#161616]">
                        {p.quality_progress}%
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-[11px] text-[#525252]">
                      <span>包含 {p.pipeline_count} 条管线 / {p.weld_count} 个焊口</span>
                      <span className="text-[#8d8d8d]">{p.status}</span>
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
          </div>
        )}

        {/* ════════════════ LEVEL 1: 管线选择列表 ════════════════ */}
        {currentLevel === 1 && (
          <div className="space-y-3">
            <div className="bg-[#edf5ff] border border-[#0f62fe] p-3 text-[13px]">
              <span className="text-[13px] text-[#0f62fe] block font-medium">已选项目</span>
              <span className="font-semibold text-[#161616]">
                {selectedProject?.project_name || selectedProject?.name} ({selectedProject?.construction_no || selectedProject?.constructionNo})
              </span>
            </div>

            <span className="text-[12px] text-[#525252] block">请选择目标管线号：</span>

            {loadingPipelines ? (
              <div className="p-8 text-center text-[#525252] text-[18px] bg-white border border-[#e0e0e0]">
                加载管线列表中...
              </div>
            ) : pipelinesList.length === 0 ? (
              <div className="p-8 text-center text-[#8d8d8d] text-[18px] bg-white border border-[#e0e0e0]">
                该项目暂未添加管线，请联系管理员
              </div>
            ) : (
              pipelinesList.map((pl) => (
                <div
                  key={pl.uuid}
                  onClick={() => handleSelectPipelineUuid(pl.uuid)}
                  className="bg-white border border-[#e0e0e0] hover:border-[#0f62fe] p-4 cursor-pointer transition-colors duration-150 flex items-center justify-between min-h-[58px]"
                >
                  <div>
                    <span className="text-[15px] font-bold text-[#161616] block">{pl.pipeline_no}</span>
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

        {/* ════════════════ LEVEL 2: 焊口卡片列表与现场新增 ════════════════ */}
        {currentLevel === 2 && (
          <div className="space-y-4">
            {/* 当前定位管线 Banner */}
            <div className="bg-[#edf5ff] border border-[#0f62fe] p-4 flex items-center justify-between">
              <div>
                <span className="text-[12px] text-[#0f62fe] block font-medium">当前定位管线号</span>
                <span className="text-[18px] font-bold text-[#161616]">{selectedPipeline}</span>
                <span className="text-[12px] text-[#525252] block mt-0.5">
                  {selectedProject?.name || selectedProject?.project_name} ({selectedProject?.constructionNo || selectedProject?.construction_no})
                </span>
              </div>
              <button
                onClick={() => navigateToLevel(1)}
                className="text-[18px] text-[#0f62fe] hover:underline bg-transparent border-none cursor-pointer outline-none font-medium"
              >
                切换管线
              </button>
            </div>

            {/* 现场快捷新增/搜索焊口控件 (复用输入框) */}
            <div className="bg-white border border-[#e0e0e0] p-4 rounded-none space-y-2">
              <span className="text-[12px] text-[#525252] block font-medium">💡 搜索或快速新增焊口：</span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={newWeldName}
                  onChange={(e) => {
                    setNewWeldName(e.target.value);
                    if (!e.target.value) setWeldSearchTerm('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      setWeldSearchTerm(newWeldName.trim());
                    }
                  }}
                  placeholder={
                    (selectedProject?.weld_prefix || selectedProject?.weldPrefix)
                      ? `输入焊口号 (留空自动按 ${selectedProject.weld_prefix || selectedProject.weldPrefix}-XX 生成)`
                      : '输入焊口号...'
                  }
                  disabled={addingWeld}
                  className="flex-1 min-w-0 h-12 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[13px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
                />
                <button
                  type="button"
                  disabled={addingWeld}
                  onClick={handleAddWeldOnsite}
                  className="h-12 px-3 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[13px] font-semibold cursor-pointer rounded-none border-none outline-none disabled:bg-[#8d8d8d] whitespace-nowrap flex items-center justify-center shrink-0"
                >
                  {addingWeld ? '新增中...' : '+ 新增焊口'}
                </button>
                <button
                  type="button"
                  onClick={() => setWeldSearchTerm(newWeldName.trim())}
                  className="h-12 px-3 bg-white border border-[#0f62fe] hover:bg-[#edf5ff] active:bg-[#d0e1fd] text-[#0f62fe] text-[13px] font-semibold cursor-pointer rounded-none outline-none whitespace-nowrap flex items-center justify-center shrink-0"
                >
                  🔍 搜索焊口
                </button>
              </div>
            </div>

            {/* 焊口卡片列表 (按智能状态排序与搜索条件筛选) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between pb-1">
                <span className="text-[13px] font-semibold text-[#161616]">
                  {weldSearchTerm
                    ? `匹配焊口 (${filteredWeldsList.length} / ${weldsList.length})`
                    : `焊口列表 (${weldsList.length})`}
                </span>
                {weldSearchTerm && (
                  <button
                    type="button"
                    onClick={() => {
                      setWeldSearchTerm('');
                      setNewWeldName('');
                    }}
                    className="text-[12px] text-[#0f62fe] hover:underline bg-transparent border-none cursor-pointer p-0"
                  >
                    重置搜索 (显示全部)
                  </button>
                )}
              </div>

              {weldsList.length === 0 ? (
                <div className="p-8 text-center text-[#8d8d8d] text-[13px] bg-white border border-[#e0e0e0]">
                  该管线暂无焊口记录，可在上方新增
                </div>
              ) : filteredWeldsList.length === 0 ? (
                <div className="p-8 text-center text-[#8d8d8d] text-[13px] bg-white border border-[#e0e0e0]">
                  未找到匹配 “{weldSearchTerm}” 的焊口，可在上方点击 “+ 新增焊口”
                </div>
              ) : (
                filteredWeldsList.map((w) => {
                  const badge = getWeldBadge(w);
                  return (
                    <div
                      key={w.id}
                      onClick={() => handleSelectWeld(w.weld_no)}
                      className={`bg-white border p-3.5 cursor-pointer transition-colors duration-150 flex items-center justify-between min-h-[60px]
                        ${badge.type === 'rejected' ? 'border-[#da1e28] bg-[#fff8f8]' : badge.type === 'completed' ? 'border-[#e0e0e0] opacity-80 hover:opacity-100' : 'border-[#e0e0e0] hover:border-[#0f62fe]'}
                      `}
                    >
                      <div className="flex items-center space-x-3">
                        <span className="text-[16px] font-bold text-[#161616]">{w.weld_no}</span>
                        <span className={`text-[11px] px-2 py-0.5 font-medium rounded-none ${badge.bg} ${badge.text}`}>
                          {badge.label}
                        </span>
                      </div>

                      {/* 三工序工况微缩标识 */}
                      <div className="flex items-center space-x-1 text-[11px] text-[#8d8d8d]">
                        <span className={w.photo_zudui && !w.photo_zudui.startsWith('REJECTED:') ? 'text-[#24a148] font-bold' : w.photo_zudui && w.photo_zudui.startsWith('REJECTED:') ? 'text-[#da1e28] font-bold' : ''}>组对</span>
                        <span>/</span>
                        <span className={w.photo_dadi && !w.photo_dadi.startsWith('REJECTED:') ? 'text-[#24a148] font-bold' : w.photo_dadi && w.photo_dadi.startsWith('REJECTED:') ? 'text-[#da1e28] font-bold' : ''}>打底</span>
                        <span>/</span>
                        <span className={w.photo_gaimian && !w.photo_gaimian.startsWith('REJECTED:') ? 'text-[#24a148] font-bold' : w.photo_gaimian && w.photo_gaimian.startsWith('REJECTED:') ? 'text-[#da1e28] font-bold' : ''}>盖面</span>
                        <span className="ml-2 text-[#0f62fe] font-medium">➔</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* ════════════════ LEVEL 3: 三工序照片上传 ════════════════ */}
        {currentLevel === 3 && selectedWeld && (
          <div className="space-y-4">
            <div className="bg-[#edf5ff] border border-[#0f62fe] p-3 text-[13px]">
              <span className="text-[12px] text-[#0f62fe] block">正在录入焊口照片</span>
              <span className="text-[16px] font-bold text-[#161616]">{selectedPipeline} - {selectedWeld}</span>
            </div>

            {/* 三工序三列卡片列表 */}
            <div className="space-y-3">
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
                    className={`border p-3.5 bg-white rounded-none grid grid-cols-12 items-center gap-2 transition-colors duration-150
                      ${isDone ? 'border-[#24a148]' : isRejected ? 'border-[#da1e28]' : 'border-[#e0e0e0]'}
                    `}
                  >
                    {/* 最左列: 工序名称和状态 */}
                    <div className="col-span-4 min-w-0 pr-1">
                      <span className="text-[15px] font-bold text-[#161616] block truncate">{type.name}</span>
                      <span
                        className={`text-[12px] block mt-1 font-medium
                          ${isDone
                            ? 'text-[#24a148]'
                            : isRejected
                              ? 'text-[#da1e28] animate-pulse font-semibold'
                              : loadingState
                                ? 'text-[#0f62fe]'
                                : 'text-[#8d8d8d]'
                          }
                        `}
                      >
                        状态: {msg}
                      </span>
                    </div>

                    {/* 中间列: 预览照片 */}
                    <div className="col-span-4 flex items-center justify-center">
                      {isDone ? (
                        <div className="w-24 h-20 bg-[#f4f4f4] border border-[#e0e0e0] flex items-center justify-center overflow-hidden">
                          <img
                            src={`/api/photo/preview?path=${encodeURIComponent(path)}`}
                            alt={type.label}
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                      ) : isRejected ? (
                        <div className="w-24 h-20 bg-[#f4f4f4] border border-[#da1e28] flex flex-col items-center justify-center overflow-hidden relative">
                          <img
                            src={`/api/photo/preview?path=${encodeURIComponent(rawPath)}`}
                            alt="不合格预览"
                            className="max-w-full max-h-full object-contain"
                          />
                          <span className="absolute bottom-0 inset-x-0 bg-[#da1e28]/90 text-white text-[9px] text-center py-0.5">不合格原图</span>
                        </div>
                      ) : (
                        <div className="w-24 h-20 bg-[#f9f9f9] border border-dashed border-[#d0d0d0] flex flex-col items-center justify-center text-[#8d8d8d] text-[11px]">
                          <span>暂无照片</span>
                        </div>
                      )}
                    </div>

                    {/* 最右列: 拍照和重新拍照按钮 */}
                    <div className="col-span-4 flex justify-end">
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
                        className={`h-12 px-3 text-[14px] font-semibold cursor-pointer rounded-none outline-none border transition-colors duration-150 flex items-center justify-center whitespace-nowrap w-full max-w-[110px]
                          ${isDone
                            ? 'border-[#c6c6c6] bg-white hover:bg-[#f4f4f4] text-[#161616]'
                            : isRejected
                              ? 'border-transparent bg-[#da1e28] hover:bg-[#b21922] text-white'
                              : 'border-transparent bg-[#0f62fe] hover:bg-[#0353e9] text-white'
                          }
                          disabled:bg-[#8d8d8d] disabled:cursor-not-allowed
                        `}
                      >
                        {isDone ? '重新拍照' : isRejected ? '重传照片' : '📷 拍照'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 底部焊口前后顺序导览按钮 (替代原来的提交控制台) */}
            <div className="pt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={handlePrevWeld}
                disabled={!hasPrevWeld}
                className={`flex-1 h-13 text-[14px] font-semibold rounded-none border-none outline-none transition-colors duration-150 flex items-center justify-center
                  ${hasPrevWeld
                    ? 'bg-[#393939] hover:bg-[#4c4c4c] text-white cursor-pointer'
                    : 'bg-[#e0e0e0] text-[#8d8d8d] cursor-not-allowed'
                  }
                `}
              >
                {hasPrevWeld ? '‹ 上一个焊口' : '已是第一个焊口'}
              </button>

              <button
                type="button"
                onClick={handleNextWeld}
                disabled={!hasNextWeld}
                className={`flex-1 h-13 text-[14px] font-semibold rounded-none border-none outline-none transition-colors duration-150 flex items-center justify-center
                  ${hasNextWeld
                    ? 'bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white cursor-pointer'
                    : 'bg-[#e0e0e0] text-[#8d8d8d] cursor-not-allowed'
                  }
                `}
              >
                {hasNextWeld ? '下一个焊口 ›' : '已是最后一个焊口'}
              </button>
            </div>
          </div>
        )}

      </div>

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
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] text-[#525252] text-[14px]">[WeldSnap] 正在初始化工作台...</div>}>
      <UploadContent />
    </Suspense>
  );
}
