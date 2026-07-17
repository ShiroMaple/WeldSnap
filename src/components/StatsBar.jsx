/**
 * 顶层总体统计看板组件 (IBM Carbon Style)
 *
 * 特性：
 *   - 扁平化无阴影 Gray 10 背景块 (#f4f4f4)
 *   - 0px 绝对直角 (rounded-none)
 *   - 高对比度水平指示条量化完工率
 */

export default function StatsBar({ stats = { total: 0, completed: 0, pending: 0 } }) {
  const { total, completed, pending } = stats;
  // 每个焊口有 3 道工序 (组对/打底/盖面)
  const totalProcesses = total * 3;
  const ratio = totalProcesses > 0 ? Math.round((completed / totalProcesses) * 100) : 0;

  return (
    <div className="flex gap-4 mb-6 flex-wrap select-none">
      {/* 焊口总数 */}
      <div className="flex-1 min-w-[200px] bg-[#f4f4f4] border border-[#e0e0e0] p-5 rounded-none flex flex-col justify-between">
        <div>
          <span className="text-[12px] font-normal tracking-[0.32px] text-[#525252]">焊口总数</span>
          <div className="text-[28px] font-light text-[#161616] mt-2 font-mono">
            {total}
          </div>
        </div>
        <div className="w-full h-1 bg-[#e0e0e0] mt-4 rounded-none overflow-hidden">
          <div className="h-full bg-[#525252]" style={{ width: '100%' }} />
        </div>
      </div>

      {/* 待录入工序数 */}
      <div className="flex-1 min-w-[200px] bg-[#f4f4f4] border border-[#e0e0e0] p-5 rounded-none flex flex-col justify-between">
        <div>
          <span className="text-[12px] font-normal tracking-[0.32px] text-[#525252]">待录入工序数</span>
          <div className="text-[28px] font-light text-[#da1e28] mt-2 font-mono">
            {pending}
          </div>
        </div>
        <div className="w-full h-1 bg-[#e0e0e0] mt-4 rounded-none overflow-hidden">
          <div className="h-full bg-[#da1e28]" style={{ width: `${totalProcesses > 0 ? Math.round((pending / totalProcesses) * 100) : 0}%` }} />
        </div>
      </div>

      {/* 已完成工序数 */}
      <div className="flex-1 min-w-[200px] bg-[#f4f4f4] border border-[#e0e0e0] p-5 rounded-none flex flex-col justify-between">
        <div>
          <span className="text-[12px] font-normal tracking-[0.32px] text-[#525252]">已完成工序数</span>
          <div className="text-[28px] font-light text-[#24a148] mt-2 font-mono">
            {completed}
          </div>
        </div>
        <div className="w-full h-1 bg-[#e0e0e0] mt-4 rounded-none overflow-hidden">
          <div className="h-full bg-[#24a148]" style={{ width: `${ratio}%` }} />
        </div>
      </div>

      {/* 质量记录完成进度 */}
      <div className="flex-1 min-w-[200px] bg-[#f4f4f4] border border-[#e0e0e0] p-5 rounded-none flex flex-col justify-between">
        <div>
          <span className="text-[12px] font-normal tracking-[0.32px] text-[#525252]">质量记录完成进度</span>
          <div className="text-[28px] font-light text-[#0f62fe] mt-2 font-mono">
            {ratio}%
          </div>
        </div>
        <div className="w-full h-1 bg-[#e0e0e0] mt-4 rounded-none overflow-hidden">
          <div className="h-full bg-[#0f62fe]" style={{ width: `${ratio}%` }} />
        </div>
      </div>
    </div>
  );
}
