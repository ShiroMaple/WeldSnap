'use client';

/**
 * 焊口工序进度矩阵矩阵表格 (Client Component)
 *
 * 特性：
 *   - 纯扁平设计，无纵向网格线，行底线为细线 (#e0e0e0)
 *   - 工序进度胶囊化呈现：已完成 10% 绿底；待录入 10% 暖沙黄底
 *   - 悬浮预览气泡：鼠标 Hover 到“已上传”标签时，在鼠标旁显示浮动的照片缩略图预览
 *     预览图片直接指向 /api/photo/preview?path=... 后端通过 302 重定向 OSS
 */

import { useState } from 'react';

export default function WeldMatrix({ records = [] }) {
  const [hoveredPhoto, setHoveredPhoto] = useState(null); // 存储当前 hover 的照片相对路径
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (photoPath, event) => {
    if (!photoPath) return;
    
    // 计算气泡显示位置 (偏向鼠标右上方)
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + window.scrollX + 130;
    const y = rect.top + window.scrollY - 100;
    
    setMousePos({ x, y });
    setHoveredPhoto(photoPath);
  };

  const handleMouseLeave = () => {
    setHoveredPhoto(null);
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
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-[#f4f4f4] transition-colors duration-100">
                  <td className="py-3.5 pr-4 font-mono font-medium">{r.weld_no}</td>
                  
                  {/* 组对 */}
                  <td className="py-3.5 px-4">
                    {r.photo_zudui ? (
                      <span
                        onMouseEnter={(e) => handleMouseEnter(r.photo_zudui, e)}
                        onMouseLeave={handleMouseLeave}
                        className="inline-block px-3 py-1 bg-[#24a148]/10 text-[#24a148] font-medium text-[11px] rounded-none cursor-help"
                      >
                        已上传
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-[#f1c21b]/10 text-[#525252] text-[11px] rounded-none">
                        未开始
                      </span>
                    )}
                  </td>

                  {/* 打底 */}
                  <td className="py-3.5 px-4">
                    {r.photo_dadi ? (
                      <span
                        onMouseEnter={(e) => handleMouseEnter(r.photo_dadi, e)}
                        onMouseLeave={handleMouseLeave}
                        className="inline-block px-3 py-1 bg-[#24a148]/10 text-[#24a148] font-medium text-[11px] rounded-none cursor-help"
                      >
                        已上传
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-[#f1c21b]/10 text-[#525252] text-[11px] rounded-none">
                        未开始
                      </span>
                    )}
                  </td>

                  {/* 盖面 */}
                  <td className="py-3.5 px-4">
                    {r.photo_gaimian ? (
                      <span
                        onMouseEnter={(e) => handleMouseEnter(r.photo_gaimian, e)}
                        onMouseLeave={handleMouseLeave}
                        className="inline-block px-3 py-1 bg-[#24a148]/10 text-[#24a148] font-medium text-[11px] rounded-none cursor-help"
                      >
                        已上传
                      </span>
                    ) : (
                      <span className="inline-block px-3 py-1 bg-[#f1c21b]/10 text-[#525252] text-[11px] rounded-none">
                        未开始
                      </span>
                    )}
                  </td>

                  <td className="py-3.5 px-4 text-[#525252]">{r.uploaded_by || '-'}</td>
                  <td className="py-3.5 pl-4 text-[#525252] font-mono">{r.uploaded_at || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 悬浮缩略图预览气泡 (IBM Carbon Spec: 无阴影, Layer 02 #e0e0e0 扁平矩形背景) */}
      {hoveredPhoto && (
        <div
          className="absolute z-[9999] p-1 bg-[#e0e0e0] border border-[#c6c6c6] rounded-none w-64 h-48 pointer-events-none transition-opacity duration-150"
          style={{
            left: `${mousePos.x}px`,
            top: `${mousePos.y}px`,
          }}
        >
          <div className="w-full h-full bg-[#f4f4f4] flex items-center justify-center overflow-hidden">
            {/* img 标签自动处理后端的 302 临时重定向 */}
            <img
              src={`/api/photo/preview?path=${encodeURIComponent(hoveredPhoto)}`}
              alt="工序照片预览"
              className="max-w-full max-h-full object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
