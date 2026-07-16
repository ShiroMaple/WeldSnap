'use client';

/**
 * 左侧管线号导航树组件 (Client Component)
 *
 * 特性：
 *   - 顶部集成“导入管线焊口 Excel”按钮和“批量打印二维码”链接
 *   - 提供管线关键字搜索框
 *   - 每一行展示管线名与进度比例，Hover 时浮现二维码查看按钮 [QR]
 */

import { useState } from 'react';

export default function PipelineTree({
  pipelines = [],
  selectedPipeline = '',
  onSelectPipeline = () => {},
  onImportClick = () => {},
  onShowQR = () => {},
}) {
  const [filterQuery, setFilterQuery] = useState('');
  const [hoveredItem, setHoveredItem] = useState(null);

  // 对管线列表进行前端本地模糊匹配过滤
  const filtered = pipelines.filter((p) =>
    p.pipeline_no.toLowerCase().includes(filterQuery.toLowerCase())
  );

  return (
    <aside className="w-80 bg-[#f4f4f4] border-r border-[#e0e0e0] flex flex-col h-full select-none">
      {/* 1. 操作与导入区域 */}
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
            href="/qrcodes-print"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#0f62fe] hover:underline flex items-center gap-1 font-medium"
          >
            🖨️ 批量打印二维码
          </a>
        </div>
      </div>

      {/* 2. 搜索过滤框 */}
      <div className="px-4 py-3 border-b border-[#e0e0e0] bg-[#e8e8e8]/30">
        <input
          type="text"
          value={filterQuery}
          onChange={(e) => setFilterQuery(e.target.value)}
          placeholder="输入关键字筛选管线号..."
          className="w-full h-8 px-3 bg-white border border-[#c6c6c6] text-[#161616] text-[13px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
        />
      </div>

      {/* 3. 管线列表导航树 */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="p-6 text-[13px] text-[#8d8d8d] text-center">
            无匹配管线号
          </div>
        ) : (
          <ul className="list-none py-1">
            {filtered.map((p) => {
              const isActive = selectedPipeline === p.pipeline_no;
              const isAllDone = p.completed === p.weld_count && p.weld_count > 0;
              const isHovered = hoveredItem === p.pipeline_no;

              return (
                <li
                  key={p.pipeline_no}
                  onClick={() => onSelectPipeline(p.pipeline_no)}
                  onMouseEnter={() => setHoveredItem(p.pipeline_no)}
                  onMouseLeave={() => setHoveredItem(null)}
                  className={`h-11 px-4 flex items-center justify-between border-l-4 cursor-pointer transition-colors duration-100 relative text-[13px]
                    ${
                      isActive
                        ? 'bg-[#edf5ff] border-[#0f62fe] text-[#0f62fe] font-medium'
                        : 'border-transparent text-[#161616] hover:bg-[#e8e8e8]/60'
                    }
                  `}
                >
                  <span className="truncate font-mono mr-2 flex-1" title={p.pipeline_no}>
                    {p.pipeline_no}
                  </span>
                  
                  <div className="flex items-center gap-2">
                    {/* Hover 时显示二维码查看按钮 [QR] */}
                    {(isHovered || isActive) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation(); // 阻止冒泡，不触发管线号选中切换
                          onShowQR(p.pipeline_no);
                        }}
                        title="查看/下载当前管线二维码"
                        className="px-1.5 py-0.5 border border-[#0f62fe] text-[#0f62fe] hover:bg-[#0f62fe] hover:text-white bg-transparent text-[11px] font-mono rounded-none cursor-pointer transition-colors duration-100"
                      >
                        QR
                      </button>
                    )}

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
