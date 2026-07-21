'use client';

/**
 * 焊口工序进度矩阵表格 (Client Component)
 *
 * 特性：
 *   - 纯扁平设计，无纵向网格线，行底线为细线 (#e0e0e0)
 *   - 前端支持多选，提供批量删除（含熔断检查）与批量下载功能
 *   - 批量下载：请求 /api/project/export-manifest 清单，利用 jszip + file-saver 零服务器负载打包
 *   - 现场创建焊口：使用 IBM Carbon 黄色微标 (Yellow Tag) 进行高亮标注
 */

import { useState, useRef, useEffect } from 'react';
import { compressImage } from '@/lib/compress';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';

export default function WeldMatrix({
  records = [],
  uploadStartDate = '',
  uploadEndDate = '',
  is24hActive = false,
  onRefresh = () => { },
  onBusyChange = () => { },
  currentUser = {},
  pipelineUuid = '',
  projectInfo = { pipeline_prefix: '', weld_prefix: '', construction_no: '', project_name: '' },
}) {
  const [hoveredPhoto, setHoveredPhoto] = useState(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ─── 多选状态 ──────────────────────────────────────────
  const [selectedUuids, setSelectedUuids] = useState([]);

  // ─── 批量下载与批量删除状态 ─────────────────────────────
  const [downloadProgress, setDownloadProgress] = useState('');
  const [deleting, setDeleting] = useState(false);

  // ─── 新增焊口 (控制台创建) 状态 ───────────────────────────
  const [newWeldName, setNewWeldName] = useState('');
  const [addingWeld, setAddingWeld] = useState(false);

  // ─── 查看完整大图 Modal 状态 ────────────────────────────
  const [viewPhotoPath, setViewPhotoPath] = useState(null);
  const [viewPhotoInfo, setViewPhotoInfo] = useState({ pipelineNo: '', weldNo: '', typeLabel: '', typeKey: '' });

  // ─── 网页端直接上传工序照片状态 ──────────────────────────
  const fileInputRef = useRef(null);
  const [uploadTarget, setUploadTarget] = useState(null); // { pipelineNo, weldNo, type, uuid }
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [uploadError, setUploadError] = useState('');

  // ─── 压缩参数（从 API 动态读取） ─────────────────────────
  const [compressConfig, setCompressConfig] = useState({ enabled: true, maxWidth: 1920, maxHeight: 1080, quality: 0.8 });

  // ─── 焊口号编辑与排序状态 ──────────────────────────────────
  const [editingUuid, setEditingUuid] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
  const [sortKey, setSortKey] = useState('weld_no'); // 'weld_no' | 'uploaded_at'
  const [sortDirection, setSortDirection] = useState(null); // null | 'asc' | 'desc'

  // 自动重置选择、编辑与排序
  useEffect(() => {
    setSelectedUuids([]);
    setSortDirection(null);
    setSortKey('weld_no');
    setEditingUuid('');
    setEditingValue('');
  }, [records]);

  // 拉取压缩参数
  useEffect(() => {
    fetch('/api/settings/compression')
      .then(r => r.json())
      .then(data => { if (data.success) setCompressConfig(data.compression); })
      .catch(() => { });
  }, []);

  const handleStartEditWeld = (uuid, currentNo) => {
    setEditingUuid(uuid);
    setEditingValue(currentNo);
    onBusyChange(true);
  };

  const handleSaveEditWeld = async () => {
    if (!editingUuid || editingSaving) return;
    const no = editingValue.trim();
    if (!no) {
      alert('焊口号不能为空');
      return;
    }

    setEditingSaving(true);
    try {
      const resp = await fetch(`/api/admin/records/${editingUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weld_no: no }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setEditingUuid('');
        setEditingValue('');
        onBusyChange(false);
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || '编辑失败');
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setEditingSaving(false);
    }
  };

  const handleCancelEditWeld = () => {
    setEditingUuid('');
    setEditingValue('');
    onBusyChange(false);
  };

  const toggleSort = (key) => {
    if (sortKey !== key) {
      setSortKey(key);
      setSortDirection('asc');
    } else {
      setSortDirection((prev) => {
        if (prev === null) return 'asc';
        if (prev === 'asc') return 'desc';
        return null;
      });
    }
  };

  // 焊口号自然排序比较算法 (纯数字按数值且优先于文本，11绝不会排在2之前)
  const compareWeldNo = (noA, noB) => {
    const valA = (noA || '').trim();
    const valB = (noB || '').trim();

    const isNumA = /^\d+$/.test(valA);
    const isNumB = /^\d+$/.test(valB);

    if (isNumA && isNumB) {
      return Number(valA) - Number(valB);
    } else if (isNumA && !isNumB) {
      return -1; // 纯数字优先
    } else if (!isNumA && isNumB) {
      return 1;  // 纯数字优先
    } else {
      return valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    }
  };

  // 1. 根据上传时间段筛选焊口列表
  const filteredRecords = records.filter((r) => {
    if (!uploadStartDate && !uploadEndDate && !is24hActive) return true;
    if (!r.uploaded_at) return false;

    const itemTime = new Date(r.uploaded_at.replace(' ', 'T')).getTime();
    if (isNaN(itemTime)) return true;

    if (is24hActive) {
      const twentyFourHoursAgo = Date.now() - 24 * 3600 * 1000;
      if (itemTime < twentyFourHoursAgo) return false;
    }

    if (uploadStartDate) {
      const startMs = new Date(uploadStartDate).getTime();
      if (!isNaN(startMs) && itemTime < startMs) return false;
    }

    if (uploadEndDate) {
      let endMs = new Date(uploadEndDate).getTime();
      if (uploadEndDate.length === 10) {
        endMs = new Date(`${uploadEndDate}T23:59:59`).getTime();
      }
      if (!isNaN(endMs) && itemTime > endMs) return false;
    }

    return true;
  });

  // 2. 计算排序后的焊口列表 (默认及按焊口号排序均采用数值优先自然排序)
  const sortedRecords = [...filteredRecords].sort((a, b) => {
    if (sortKey === 'uploaded_at') {
      const valA = a.uploaded_at || '';
      const valB = b.uploaded_at || '';
      if (!valA && valB) return 1;
      if (valA && !valB) return -1;
      if (!valA && !valB) return 0;
      const cmp = valA.localeCompare(valB);
      return sortDirection === 'desc' ? -cmp : cmp;
    } else {
      const cmp = compareWeldNo(a.weld_no, b.weld_no);
      return sortDirection === 'desc' ? -cmp : cmp;
    }
  });

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

  const tooltipTop = mousePos.y - 200 < 10 ? mousePos.y + 15 : mousePos.y - 200;
  const tooltipLeft = mousePos.x + 15;

  // ─── 大图 Modal 交互 ───────────────────────────────────
  const handleOpenPhotoModal = (path, pipelineNo, weldNo, typeLabel, typeKey) => {
    setViewPhotoPath(path);
    setViewPhotoInfo({ pipelineNo, weldNo, typeLabel, typeKey });
    setHoveredPhoto(null);
    onBusyChange(true);
  };

  const handleClosePhotoModal = () => {
    setViewPhotoPath(null);
    onBusyChange(false);
  };

  // 标记为不合格
  const handleRejectPhoto = async () => {
    if (!viewPhotoInfo.typeKey) return;

    // 找出该焊口在 records 中的真实 UUID
    const targetWeld = records.find(r => r.weld_no === viewPhotoInfo.weldNo);
    if (!targetWeld) return;

    if (!confirm(`确定将该工序照片标记为不合格？\n标记后状态将变更为“需重传”。`)) return;

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
        setViewPhotoPath(null);
        onBusyChange(false);
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || '操作失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  // 彻底删除照片 (兼删 OSS 对象)
  const [deletingPhoto, setDeletingPhoto] = useState(false);
  const handleDeletePhoto = async () => {
    if (!viewPhotoInfo.typeKey || !viewPhotoInfo.pipelineNo || !viewPhotoInfo.weldNo) return;

    const typeCN = viewPhotoInfo.typeLabel || viewPhotoInfo.typeKey;
    const confirmText = `⚠️ 危险操作确认：\n确定彻底删除【${viewPhotoInfo.pipelineNo}】管线 /【${viewPhotoInfo.weldNo}】焊口 的 [${typeCN}] 工序照片？\n\n此操作将同时彻底删除阿里云 OSS 云端存储的对象，且数据库相关字段将被置空，不可恢复！`;

    if (!confirm(confirmText)) return;

    setDeletingPhoto(true);
    try {
      const resp = await fetch('/api/admin/photo/delete', {
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
        alert('照片及其 OSS 云端对象已彻底删除');
        setViewPhotoPath(null);
        onBusyChange(false);
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || '删除照片失败');
      }
    } catch {
      alert('网络连接失败，删除操作中止');
    } finally {
      setDeletingPhoto(false);
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
      const cleanLabel = viewPhotoInfo.typeLabel.replace(/\s+/g, '');
      a.download = `${viewPhotoInfo.pipelineNo}_${viewPhotoInfo.weldNo}_${cleanLabel}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      window.open(`/api/photo/preview?path=${encodeURIComponent(viewPhotoPath)}`, '_blank');
    }
  };

  // ─── 批量多选逻辑 ──────────────────────────────────────
  const handleToggleSelectWeld = (uuid) => {
    setSelectedUuids((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  };

  const handleSelectAll = () => {
    setSelectedUuids(records.map((r) => r.uuid));
  };

  const handleDeselectAll = () => {
    setSelectedUuids([]);
  };

  const handleInvertSelect = () => {
    setSelectedUuids((prev) =>
      records.map((r) => r.uuid).filter((uuid) => !prev.includes(uuid))
    );
  };

  // ─── 控制台后台新增焊口 ──────────────────────────────────
  const handleAddWeld = async () => {
    if (!pipelineUuid) return;
    const inputNo = newWeldName.trim();
    if (!projectInfo.weld_prefix && !inputNo) {
      alert('请输入焊口号');
      return;
    }

    setAddingWeld(true);
    try {
      const resp = await fetch('/api/welds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline_uuid: pipelineUuid,
          weld_no: inputNo,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setNewWeldName('');
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || '添加焊口失败');
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setAddingWeld(false);
    }
  };

  // ─── 批量删除焊口 (含熔断逻辑) ────────────────────────────
  const handleBulkDeleteWelds = async (force = false) => {
    if (selectedUuids.length === 0) {
      alert('请先勾选需要删除的焊口');
      return;
    }

    const confirmMsg = force
      ? '⚠️ 确定强行删除所有选中的焊口及其照片记录吗？此操作不可逆！'
      : `确定批量删除选中的 ${selectedUuids.length} 条焊口记录吗？`;

    if (!confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      const resp = await fetch('/api/admin/records/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuids: selectedUuids,
          type: 'weld',
          force: force,
        }),
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        setSelectedUuids([]);
        if (onRefresh) onRefresh();
        alert('删除成功');
      } else {
        // 触发熔断检查
        if (data.error && data.error.includes('拦截')) {
          if (currentUser.role === 'admin') {
            if (confirm(`${data.error}\n\n检测到您是系统管理员，确认强行删除选中的有图焊口吗？`)) {
              handleBulkDeleteWelds(true);
              return;
            }
          } else if (currentUser.role === 'project_admin') {
            alert(`${data.error}\n\n项目管理员无权删除包含照片的记录，请联系系统管理员处理。`);
          } else {
            alert(data.error);
          }
        } else {
          alert(data.error || '删除失败');
        }
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setDeleting(false);
    }
  };

  // ─── 零服务器负载前端批量打包下载 ──────────────────────────
  const handleBulkDownloadZip = async () => {
    if (selectedUuids.length === 0) {
      alert('请先勾选需要下载的焊口');
      return;
    }

    setDownloadProgress('正在请求云端清单...');
    try {
      const resp = await fetch('/api/project/export-manifest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weld_uuids: selectedUuids }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || '获取下载清单失败');
      }

      const manifest = data.manifest || [];
      if (manifest.length === 0) {
        alert('选中的焊口下尚无有效照片记录');
        setDownloadProgress('');
        return;
      }

      setDownloadProgress(`正在下载打包 (0/${manifest.length})...`);
      const zip = new JSZip();

      let completedCount = 0;
      await Promise.all(
        manifest.map(async (item) => {
          try {
            const fileResp = await fetch(item.url);
            if (!fileResp.ok) throw new Error('网络文件请求失败');
            const blob = await fileResp.blob();
            zip.file(item.filename, blob);
            completedCount++;
            setDownloadProgress(`正在下载打包 (${completedCount}/${manifest.length})...`);
          } catch (err) {
            console.error(`下载文件失败: ${item.filename}`, err);
          }
        })
      );

      setDownloadProgress('正在本地构建压缩包...');
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      saveAs(zipBlob, `${projectInfo.construction_no}_焊口照片归档_${new Date().toISOString().slice(0, 10)}.zip`);
      setDownloadProgress('');
    } catch (err) {
      alert(`批量下载失败: ${err.message}`);
      setDownloadProgress('');
    }
  };

  // ─── 网页直接上传照片交互 ───────────────────────────────
  const handleUploadClick = (pipelineNo, weldNo, type, uuid) => {
    setUploadTarget({ pipelineNo, weldNo, type, uuid });
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !uploadTarget) return;

    onBusyChange(true);
    const { type, uuid } = uploadTarget;
    setUploadError('');
    setUploadStatus('compressing');

    try {
      let blobToSend = file;
      if (compressConfig.enabled) {
        blobToSend = await compressImage(file, compressConfig.maxWidth, compressConfig.maxHeight, compressConfig.quality);
      }

      setUploadStatus('signing');
      const signResp = await fetch('/api/upload/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weld_uuid: uuid,
          photo_type: type,
        }),
      });
      const signData = await signResp.json();
      if (!signResp.ok || !signData.success) {
        throw new Error(signData.error || '获取上传签名失败');
      }

      const { signedUrl, objectKey } = signData;

      setUploadStatus('uploading');
      const ossResp = await fetch(signedUrl, {
        method: 'PUT',
        body: blobToSend,
        headers: {
          'Content-Type': 'image/jpeg',
        },
      });
      if (ossResp.status !== 200) {
        throw new Error('直传 OSS 服务器失败');
      }

      setUploadStatus('confirming');
      const confirmResp = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          weld_uuid: uuid,
          photo_type: type,
          objectKey: objectKey,
        }),
      });
      const confirmData = await confirmResp.json();
      if (!confirmResp.ok || !confirmData.success) {
        throw new Error(confirmData.error || '状态同步失败');
      }

      setUploadStatus('success');
      onBusyChange(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadTarget(null);
        if (onRefresh) onRefresh();
      }, 1000);

    } catch (err) {
      setUploadStatus('error');
      setUploadError(err.message || '上传异常');
      onBusyChange(false);
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white relative">

      {/* 快捷批量下载、批量删除与控制台新增焊口条 (固定高度 h-[76px] 且为两行排版，以实现与左侧完美的对称对齐) */}
      <div className="h-[76px] px-4 py-2.5 border-b border-[#e0e0e0] bg-[#f4f4f4] flex flex-col justify-between select-none">

        {/* 第一行：添加焊口与批量操作按钮 */}
        <div className="flex justify-between items-center w-full">
          {/* 1. 添加焊口 */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newWeldName}
              onChange={(e) => setNewWeldName(e.target.value)}
              placeholder={projectInfo.weld_prefix ? "自定义焊口号" : "输入新增焊口号"}
              disabled={addingWeld}
              className="h-8 px-3 bg-white border border-[#c6c6c6] text-[12px] outline-none focus:border-[#0f62fe] rounded-none w-44 placeholder-[#8d8d8d] font-sans"
            />
            <button
              onClick={handleAddWeld}
              disabled={addingWeld}
              className="h-8 px-4 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] font-medium cursor-pointer rounded-none border-none outline-none"
            >
              {addingWeld ? '添加中...' : `+ 添加焊口`}
            </button>
          </div>

          {/* 2. 批量操作按钮 */}
          <div className="flex items-center gap-2">
            {selectedUuids.length > 0 && (
              <>
                <button
                  onClick={handleBulkDownloadZip}
                  disabled={!!downloadProgress}
                  className="h-8 px-4 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] cursor-pointer rounded-none border-none font-medium"
                >
                  {downloadProgress || `📦 批量下载已选 (${selectedUuids.length})`}
                </button>
                <button
                  onClick={() => handleBulkDeleteWelds(false)}
                  disabled={deleting}
                  className="h-8 px-4 bg-[#da1e28] hover:bg-[#b21922] text-white text-[12px] cursor-pointer rounded-none border-none font-medium"
                >
                  🗑️ 删除已选 ({selectedUuids.length})
                </button>
              </>
            )}
          </div>
        </div>

        {/* 第二行：批量选择选项与数量指示 */}
        <div className="flex justify-between items-center w-full text-[11px] text-[#525252]">
          <div className="flex items-center gap-2">
            <button onClick={handleSelectAll} className="hover:underline cursor-pointer">全选</button>
            <span>/</span>
            <button onClick={handleDeselectAll} className="hover:underline cursor-pointer">清空</button>
            <span>/</span>
            <button onClick={handleInvertSelect} className="hover:underline cursor-pointer">反选</button>
          </div>

          <span className="text-[12px] text-[#525252]">
            {(uploadStartDate || uploadEndDate || is24hActive)
              ? `筛选共 ${sortedRecords.length} / ${records.length} 个焊口`
              : `共 ${records.length} 个焊口`}
          </span>
        </div>
      </div>

      {/* 焊口数据列表 */}
      <div className="flex-1 overflow-auto p-6 relative">
        {records.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[#8d8d8d] text-[14px] select-none">
            该管线号下暂无焊口数据，请在右侧新增或通过左侧导入 Excel
          </div>
        ) : (
          <div className="w-full">
            <table className="w-full border-collapse text-[13px] text-left select-none">
              <thead>
                <tr className="border-b border-[#c6c6c6] text-[#525252] font-semibold">
                  <th className="pb-3 pr-4 font-medium w-10">
                    {/* 复选框占位 */}
                  </th>
                  <th
                    id="weld-no-header"
                    onClick={() => toggleSort('weld_no')}
                    className="pb-3 px-4 font-medium cursor-pointer hover:bg-[#e8e8e8]/60 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>焊口号</span>
                      <span className="text-[11px] text-[#525252]">
                        {sortKey === 'weld_no' && sortDirection === 'asc' ? '▲' : sortKey === 'weld_no' && sortDirection === 'desc' ? '▼' : '⇅'}
                      </span>
                    </div>
                  </th>
                  <th className="pb-3 px-4 font-medium">组对工序</th>
                  <th className="pb-3 px-4 font-medium">打底工序</th>
                  <th className="pb-3 px-4 font-medium">盖面工序</th>
                  <th className="pb-3 px-4 font-medium">最近上传人</th>
                  <th
                    id="weld-upload-time-header"
                    onClick={() => toggleSort('uploaded_at')}
                    className="pb-3 pl-4 font-medium cursor-pointer hover:bg-[#e8e8e8]/60 transition-colors select-none"
                  >
                    <div className="flex items-center gap-1.5">
                      <span>最近上传时间</span>
                      <span className="text-[11px] text-[#525252]">
                        {sortKey === 'uploaded_at' && sortDirection === 'asc' ? '▲' : sortKey === 'uploaded_at' && sortDirection === 'desc' ? '▼' : '⇅'}
                      </span>
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#e0e0e0] text-[#161616]">
                {sortedRecords.map((r) => {
                  const isChecked = selectedUuids.includes(r.uuid);
                  const isOnsite = r.create_source === '现场创建';

                  const cellRender = (field, typeKey, typeLabel) => {
                    const path = r[field];
                    if (!path) {
                      return (
                        <span
                          onClick={() => handleUploadClick(r.pipeline_no, r.weld_no, typeKey, r.uuid)}
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
                      <td className="py-3.5 pr-4">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => handleToggleSelectWeld(r.uuid)}
                          className="w-4 h-4 cursor-pointer rounded-none accent-[#0f62fe]"
                        />
                      </td>
                      <td className="py-3.5 px-4 font-medium flex items-center gap-2">
                        {editingUuid === r.uuid ? (
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleSaveEditWeld();
                              if (e.key === 'Escape') handleCancelEditWeld();
                            }}
                            onBlur={handleSaveEditWeld}
                            disabled={editingSaving}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="h-7 px-1 bg-white border border-[#0f62fe] text-[12px] outline-none rounded-none w-28"
                          />
                        ) : (
                          <>
                            <span
                              className={(currentUser.role === 'admin' || currentUser.role === 'project_admin') ? "cursor-text hover:underline font-semibold text-[#161616]" : ""}
                              title={(currentUser.role === 'admin' || currentUser.role === 'project_admin') ? "双击编辑焊口号" : ""}
                              onDoubleClick={(e) => {
                                if (currentUser.role === 'admin' || currentUser.role === 'project_admin') {
                                  e.stopPropagation();
                                  handleStartEditWeld(r.uuid, r.weld_no);
                                }
                              }}
                            >
                              {r.weld_no}
                            </span>
                            {isOnsite && (
                              <span
                                className="bg-[#f1c21b]/20 text-[#161616] text-[10px] px-1 py-0.2 font-medium border border-[#f1c21b]/30"
                                title="现场新增账号创建的焊口记录，管理员需核对名称是否符合图纸规范"
                              >
                                现场创建
                              </span>
                            )}
                          </>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {cellRender('photo_zudui', 'zudui', '组对工序')}
                      </td>
                      <td className="py-3.5 px-4">
                        {cellRender('photo_dadi', 'dadi', '打底工序')}
                      </td>
                      <td className="py-3.5 px-4">
                        {cellRender('photo_gaimian', 'gaimian', '盖面工序')}
                      </td>
                      <td className="py-3.5 px-4 text-[#525252]">{r.uploaded_by || '-'}</td>
                      <td className="py-3.5 pl-4 text-[#525252]">{r.uploaded_at || '-'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 隐藏的直接上传文件 Input */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Hover 跟随悬浮预览气泡 */}
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

      {/* 大图查看及驳回 Modal */}
      {viewPhotoPath && (
        <div className="fixed inset-0 bg-black/75 z-[99999] flex flex-col items-center justify-center p-4">
          <div className="w-full max-w-[800px] bg-white border border-[#e0e0e0] flex flex-col rounded-none shadow-none">

            {/* Modal Header */}
            <div className="flex justify-between items-center px-6 py-4 border-b border-[#e0e0e0] select-none">
              <div>
                <h3 className="text-[16px] font-semibold text-[#161616]">
                  {viewPhotoInfo.typeLabel} 照片详情
                </h3>
                <span className="text-[12px] text-[#525252]">
                  管线: {viewPhotoInfo.pipelineNo} | 焊口: {viewPhotoInfo.weldNo}
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

            {/* Photo Preview Body */}
            <div className="p-4 bg-[#f4f4f4] flex items-center justify-center overflow-hidden min-h-[300px] max-h-[70vh]">
              <img
                src={`/api/photo/preview?path=${encodeURIComponent(viewPhotoPath)}`}
                alt="Weld Photo Full"
                className="max-w-full max-h-[60vh] object-contain"
              />
            </div>

            {/* Modal Footer Control */}
            <div className="flex justify-end items-center gap-3 px-6 py-4 border-t border-[#e0e0e0] select-none">
              {!viewPhotoPath.startsWith('REJECTED:') && (
                <button
                  type="button"
                  onClick={handleRejectPhoto}
                  className="h-10 px-4 bg-[#da1e28] hover:bg-[#b21922] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium mr-auto"
                >
                  标记不合格 (需重传)
                </button>
              )}

              {viewPhotoPath.startsWith('REJECTED:') && (
                <button
                  type="button"
                  onClick={() => {
                    setViewPhotoPath(null);
                    onBusyChange(false);
                    const targetWeld = records.find(r => r.weld_no === viewPhotoInfo.weldNo);
                    if (targetWeld) {
                      handleUploadClick(viewPhotoInfo.pipelineNo, viewPhotoInfo.weldNo, viewPhotoInfo.typeKey, targetWeld.uuid);
                    }
                  }}
                  className="h-10 px-4 bg-[#da1e28] hover:bg-[#b21922] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium mr-auto"
                >
                  重新上传覆盖照片
                </button>
              )}

              {/* 彻底删除照片及 OSS 云端对象按键 */}
              <button
                type="button"
                onClick={handleDeletePhoto}
                disabled={deletingPhoto}
                className="h-10 px-4 bg-[#393939] hover:bg-[#da1e28] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium transition-colors duration-150 flex items-center space-x-1 disabled:opacity-50"
                title="删除数据库记录并同时彻底清除阿里云 OSS 对象"
              >
                <span>🗑️ {deletingPhoto ? '删除中...' : '彻底删除照片'}</span>
              </button>

              <button
                type="button"
                onClick={handleClosePhotoModal}
                className="h-10 px-5 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[13px] text-[#161616] cursor-pointer rounded-none"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={handleDownloadPhoto}
                className="h-10 px-6 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium"
              >
                保存图片
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Progress Modals */}
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
