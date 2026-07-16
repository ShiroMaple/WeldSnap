'use client';

/**
 * 左侧管线号导航树组件 (Client Component)
 *
 * 特性：
 *   - 支持多选（全选/反选），用于批量删除与批量二维码打印
 *   - 直接展示 QR 查看按钮，无需 Hover
 *   - 自动适配项目前缀添加管线（有前缀时自动递增 PL-001，无前缀时提供输入框）
 *   - 级联统计每个管线的完工情况比例
 */

import { useState } from 'react';

export default function PipelineTree({
  projectUuid = '',
  projectInfo = { pipeline_prefix: '', weld_prefix: '', construction_no: '', project_name: '' },
  pipelines = [],
  selectedPipelineUuid = '',
  onSelectPipelineUuid = () => {},
  onImportClick = () => {},
  onShowQR = () => {},
  onRefresh = () => {},
  currentUser = {},
}) {
  const [filterQuery, setFilterQuery] = useState('');
  
  // 选中的管线 UUID 集合
  const [selectedUuids, setSelectedUuids] = useState([]);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // 1. 过滤管线列表
  const filtered = pipelines.filter((p) =>
    p.pipeline_no.toLowerCase().includes(filterQuery.toLowerCase())
  );

  // 2. 选择逻辑
  const handleToggleSelect = (uuid) => {
    setSelectedUuids((prev) =>
      prev.includes(uuid) ? prev.filter((id) => id !== uuid) : [...prev, uuid]
    );
  };

  const handleSelectAll = () => {
    setSelectedUuids(filtered.map((p) => p.uuid));
  };

  const handleDeselectAll = () => {
    setSelectedUuids([]);
  };

  const handleToggleInvert = () => {
    setSelectedUuids((prev) =>
      filtered.map((p) => p.uuid).filter((uuid) => !prev.includes(uuid))
    );
  };

  // 3. 新建管线
  const handleAddPipeline = async () => {
    if (!projectUuid) return;
    if (!projectInfo.pipeline_prefix && !newPipelineName.trim()) {
      alert('请输入管线号');
      return;
    }

    setAddingPipeline(true);
    try {
      const resp = await fetch('/api/admin/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_uuid: projectUuid,
          pipeline_no: projectInfo.pipeline_prefix ? '' : newPipelineName.trim(),
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setNewPipelineName('');
        if (onRefresh) onRefresh();
      } else {
        alert(data.error || '创建管线失败');
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setAddingPipeline(false);
    }
  };

  // 4. 批量删除管线 (含熔断逻辑)
  const handleBulkDeletePipelines = async (force = false) => {
    if (selectedUuids.length === 0) {
      alert('请先勾选需要删除的管线');
      return;
    }

    const confirmMsg = force 
      ? '⚠️ 确定强行删除所有选中的管线及其关联的所有焊口与照片吗？此操作不可逆！' 
      : `确定批量删除选中的 ${selectedUuids.length} 条管线记录吗？`;

    if (!confirm(confirmMsg)) return;

    setDeleting(true);
    try {
      const resp = await fetch('/api/admin/records/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuids: selectedUuids,
          type: 'pipeline',
          force: force,
        }),
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        setSelectedUuids([]);
        if (onRefresh) onRefresh();
        alert('删除成功');
      } else {
        // 熔断提示
        if (data.error && data.error.includes('拦截')) {
          if (currentUser.role === 'admin') {
            // 系统管理员提供强删除渠道
            if (confirm(`${data.error}\n\n检测到您拥有管理员权限，是否确认强行删除选中的所有关联数据（包括已上传照片）？`)) {
              handleBulkDeletePipelines(true);
              return;
            }
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

  // 5. 打印链接生成
  const printUrl = selectedUuids.length > 0
    ? `/qrcodes-print?project_uuid=${projectUuid}&uuids=${selectedUuids.join(',')}`
    : `/qrcodes-print?project_uuid=${projectUuid}`;

  return (
    <aside className="w-85 bg-[#f4f4f4] border-r border-[#e0e0e0] flex flex-col h-full select-none">
      
      {/* Excel 导入区块 */}
      <div className="p-4 border-b border-[#e0e0e0] space-y-3">
        <button
          onClick={onImportClick}
          className="w-full h-10 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[13px] font-medium tracking-[0.16px] transition-colors duration-150 rounded-none border-none outline-none cursor-pointer flex items-center justify-center gap-2"
        >
          <span>📥</span> 导入管线焊口 Excel
        </button>

        <div className="flex justify-between items-center text-[12px] px-1">
          <span className="text-[#525252]">管线共 {pipelines.length} 条</span>
          <a
            href={printUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0f62fe] hover:underline flex items-center gap-1 font-medium"
          >
            🖨️ {selectedUuids.length > 0 ? `打印已选二维码 (${selectedUuids.length})` : '批量打印二维码'}
          </a>
        </div>
      </div>

      {/* 搜索与快捷多选栏 */}
      <div className="px-4 py-2 bg-[#e8e8e8]/30 border-b border-[#e0e0e0] space-y-2">
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="输入管线号筛选..."
          className="w-full h-8 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[13px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
        />

        <div className="flex justify-between items-center text-[11px] text-[#525252] pt-1">
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="hover:text-[#0f62fe] cursor-pointer">全选</button>
            <span>/</span>
            <button onClick={handleDeselectAll} className="hover:text-[#0f62fe] cursor-pointer">全清</button>
            <span>/</span>
            <button onClick={handleToggleInvert} className="hover:text-[#0f62fe] cursor-pointer">反选</button>
          </div>
          {selectedUuids.length > 0 && (
            <button
              onClick={() => handleBulkDeletePipelines(false)}
              disabled={deleting}
              className="text-[#da1e28] hover:underline cursor-pointer font-medium"
            >
              🗑️ 删除已选 ({selectedUuids.length})
            </button>
          )}
        </div>
      </div>

      {/* 快捷新增管线控制 */}
      <div className="px-4 py-3 bg-[#e8e8e8]/50 border-b border-[#e0e0e0]">
        {projectInfo.pipeline_prefix ? (
          <button
            type="button"
            disabled={addingPipeline}
            onClick={handleAddPipeline}
            className="w-full h-9 bg-white border border-[#0f62fe] text-[#0f62fe] hover:bg-[#edf5ff] text-[12px] font-medium cursor-pointer rounded-none outline-none"
          >
            {addingPipeline ? '正在生成...' : `+ 自动生成管线 (前缀: ${projectInfo.pipeline_prefix}-XXX)`}
          </button>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              value={newPipelineName}
              onChange={(e) => setNewPipelineName(e.target.value)}
              placeholder="新增管线号..."
              disabled={addingPipeline}
              className="flex-1 h-9 px-3 bg-white border border-[#c6c6c6] text-[12px] outline-none focus:border-[#0f62fe] rounded-none"
            />
            <button
              type="button"
              disabled={addingPipeline}
              onClick={handleAddPipeline}
              className="h-9 px-3 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] cursor-pointer rounded-none border-none font-medium"
            >
              添加
            </button>
          </div>
        )}
      </div>

      {/* 列表树导航 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-[13px] text-[#8d8d8d] text-center">无管线数据</div>
        ) : (
          <ul className="list-none py-1">
            {filtered.map((p) => {
              const isActive = selectedPipelineUuid === p.uuid;
              const isChecked = selectedUuids.includes(p.uuid);
              const isAllDone = p.completed === p.weld_count && p.weld_count > 0;

              return (
                <li
                  key={p.uuid}
                  onClick={() => onSelectPipelineUuid(p.uuid, p.pipeline_no)}
                  className={`h-11 px-4 flex items-center justify-between border-l-4 cursor-pointer transition-colors duration-100 relative text-[13px]
                    ${
                      isActive
                        ? 'bg-[#edf5ff] border-[#0f62fe] text-[#0f62fe] font-medium'
                        : 'border-transparent text-[#161616] hover:bg-[#e8e8e8]/60'
                    }
                  `}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onChange={() => handleToggleSelect(p.uuid)}
                      onClick={(e) => e.stopPropagation()} // 阻止触发选中管线
                      className="w-4 h-4 cursor-pointer rounded-none accent-[#0f62fe]"
                    />
                    <span className="truncate font-mono flex-1" title={p.pipeline_no}>
                      {p.pipeline_no}
                    </span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {/* 直接显示 QR 查看按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowQR(p.uuid);
                      }}
                      title="查看/下载当前管线二维码"
                      className="px-1.5 py-0.5 border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe] hover:text-white bg-transparent text-[11px] font-mono rounded-none cursor-pointer transition-colors duration-100"
                    >
                      QR
                    </button>

                    <span
                      className={`text-[11px] px-1.5 py-0.5 font-mono rounded-none
                        ${
                          isAllDone
                            ? 'bg-[#24a148]/10 text-[#24a148]'
                            : 'bg-black/5 text-[#525252]'
                        }
                      `}
                    >
                      {p.completed}/{p.weld_count}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </aside>
  );
}
