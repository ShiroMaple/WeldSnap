'use client';

/**
 * 左侧管线号导航树组件 (Client Component)
 *
 * 特性：
 *   - 将“管线筛选”放到列表最上方，与右侧的“焊口筛选”对齐。
 *   - 将“导入管线”“批量打印”“添加管线”改为三个并列的按钮，紧靠“管线筛选”下方。
 *   - 支持双击编辑管线号，多选批量打印与删除。
 */

import { useState } from 'react';

export default function PipelineTree({
  projectUuid = '',
  projectInfo = { pipeline_prefix: '', weld_prefix: '', construction_no: '', project_name: '' },
  pipelines = [],
  selectedPipelineUuid = '',
  onSelectPipelineUuid = () => { },
  onImportClick = () => { },
  onShowQR = () => { },
  onRefresh = () => { },
  onBusyChange = () => { },
  currentUser = {},
}) {
  const [filterQuery, setFilterQuery] = useState('');

  // 选中的管线 UUID 集合
  const [selectedUuids, setSelectedUuids] = useState([]);

  // 编辑状态
  const [editingUuid, setEditingUuid] = useState('');
  const [editingValue, setEditingValue] = useState('');
  const [editingSaving, setEditingSaving] = useState(false);
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

    let pipelineNo = '';
    if (projectInfo.pipeline_prefix) {
      // 有前缀，由后端自动生成下一个
      pipelineNo = '';
    } else {
      // 无前缀，弹出提示手动输入
      const promptVal = prompt('请输入新的管线号:');
      if (promptVal === null) return; // 取消
      pipelineNo = promptVal.trim();
      if (!pipelineNo) {
        alert('管线号不能为空');
        return;
      }
    }

    setAddingPipeline(true);
    try {
      const resp = await fetch('/api/admin/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_uuid: projectUuid,
          pipeline_no: pipelineNo,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
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

  // 5. 内联编辑管线号
  const handleStartEditPipeline = (uuid, currentNo) => {
    setEditingUuid(uuid);
    setEditingValue(currentNo);
    onBusyChange(true);
  };

  const handleSaveEditPipeline = async () => {
    if (!editingUuid || editingSaving) return;
    const no = editingValue.trim();
    if (!no) {
      alert('管线号不能为空');
      return;
    }

    setEditingSaving(true);
    try {
      const resp = await fetch(`/api/admin/pipelines/${editingUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_no: no }),
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

  const handleCancelEditPipeline = () => {
    setEditingUuid('');
    setEditingValue('');
    onBusyChange(false);
  };

  // 6. 打印链接生成
  const printUrl = selectedUuids.length > 0
    ? `/qrcodes-print?project_uuid=${projectUuid}&uuids=${selectedUuids.join(',')}`
    : `/qrcodes-print?project_uuid=${projectUuid}`;

  return (
    <aside className="w-85 bg-[#f4f4f4] border-r border-[#e0e0e0] flex flex-col h-full select-none">

      {/* 1. 管线筛选区域 - 最上方，高度固定 h-16 以便与右侧对齐 */}
      <div className="h-16 px-4 border-b border-[#e0e0e0] bg-[#f4f4f4] flex items-center select-none">
        <div className="flex items-center gap-2 w-full">
          <span className="text-[12px] text-[#525252] shrink-0 font-medium">管线筛选:</span>
          <input
            type="text"
            value={filterQuery}
            onChange={(e) => setFilterQuery(e.target.value)}
            placeholder="输入管线号筛选..."
            className="w-full h-8 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[13px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
          />
        </div>
      </div>

      {/* 2. 快捷操作栏（三个并列按钮）直接放置在管线号筛选下方 (固定高度 h-[76px] 以便与右侧对齐) */}
      <div className="h-[76px] px-4 py-2.5 bg-[#f4f4f4] border-b border-[#e0e0e0] flex flex-col justify-between select-none">
        <div className="grid grid-cols-3 gap-1.5">
          <button
            type="button"
            disabled={addingPipeline}
            onClick={handleAddPipeline}
            className="h-8 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[11px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center justify-center gap-1 font-sans"
          >
            {addingPipeline ? '正在生成...' : '+ 添加管线'}
          </button>

          <button
            type="button"
            onClick={() => window.open(printUrl, '_blank')}
            className="h-8 bg-transparent border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe]/10 text-[11px] font-medium cursor-pointer rounded-none outline-none flex items-center justify-center gap-1 font-sans"
          >
            打印二维码
          </button>

          <button
            onClick={onImportClick}
            className="h-8 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[11px] font-medium cursor-pointer rounded-none border-none outline-none flex items-center justify-center gap-1 font-sans"
          >
            批量导入
          </button>

        </div>

        {/* 选中的多选与数量提示 */}
        <div className="flex justify-between items-center text-[11px] text-[#525252]">
          <div className="flex gap-2">
            <button onClick={handleSelectAll} className="hover:text-[#0f62fe] cursor-pointer">全选</button>
            <span>/</span>
            <button onClick={handleDeselectAll} className="hover:text-[#0f62fe] cursor-pointer">清空</button>
            <span>/</span>
            <button onClick={handleToggleInvert} className="hover:text-[#0f62fe] cursor-pointer">反选</button>
          </div>
          {selectedUuids.length > 0 ? (
            <button
              onClick={() => handleBulkDeletePipelines(false)}
              disabled={deleting}
              className="text-[#da1e28] hover:underline cursor-pointer font-medium"
            >
              🗑️ 删除已选 ({selectedUuids.length})
            </button>
          ) : (
            <span className="text-[12px] text-[#525252]">共 {pipelines.length} 条管线</span>
          )}
        </div>
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
                    ${isActive
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
                    {editingUuid === p.uuid ? (
                      <input
                        type="text"
                        value={editingValue}
                        onChange={(e) => setEditingValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveEditPipeline();
                          if (e.key === 'Escape') handleCancelEditPipeline();
                        }}
                        onBlur={handleSaveEditPipeline}
                        disabled={editingSaving}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 h-7 px-1 bg-white border border-[#0f62fe] text-[12px] outline-none rounded-none"
                      />
                    ) : (
                      <span
                        className="truncate flex-1 cursor-text font-semibold text-[#161616]"
                        title="双击编辑管线号"
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          handleStartEditPipeline(p.uuid, p.pipeline_no);
                        }}
                      >
                        {p.pipeline_no}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    {/* 直接显示 QR 查看按钮 */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShowQR(p.uuid);
                      }}
                      title="查看/下载当前管线二维码"
                      className="px-1.5 py-0.5 border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe] hover:text-white bg-transparent text-[11px] font-semibold rounded-none cursor-pointer transition-colors duration-100"
                    >
                      QR
                    </button>

                    <span
                      className={`text-[11px] px-1.5 py-0.5 font-medium rounded-none
                        ${isAllDone
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
