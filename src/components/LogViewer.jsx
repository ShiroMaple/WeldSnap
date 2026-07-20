'use client';

/**
 * 系统日志查看器 (IBM Carbon Design System 风格)
 *
 * 特性：
 *   - 支持全量 Pino NDJSON 日志展示与全文本/TraceId/级别筛选
 *   - 支持全动态调整全局 Pino 日志级别（即时生效 + 持久化存储）
 *   - 支持点击 TraceId 一键高亮追溯同一 HTTP 请求的所有全链路日志
 *   - 支持开启 Auto-Tail (实时日志流)，每 3s 增量刷新
 *   - 支持导出 .log (NDJSON) 或 .csv 报表
 */

import { useState, useEffect, useCallback } from 'react';

const LEVEL_COLORS = {
  10: { bg: '#f4f4f4', text: '#525252', label: 'TRACE' },
  20: { bg: '#e0e0e0', text: '#161616', label: 'DEBUG' },
  30: { bg: '#edf5ff', text: '#0f62fe', label: 'INFO' },
  40: { bg: '#fcf4d6', text: '#b28600', label: 'WARN' },
  50: { bg: '#fff2f0', text: '#da1e28', label: 'ERROR' },
  60: { bg: '#fff2f0', text: '#750e13', label: 'FATAL' },
};

export default function LogViewer() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [meta, setMeta] = useState({ fileCount: 0, totalFormattedSize: '0 MB' });

  // 筛选条件
  const [levelFilter, setLevelFilter] = useState('');
  const [errorOnly, setErrorOnly] = useState(false);
  const [traceIdFilter, setTraceIdFilter] = useState('');
  const [keyword, setKeyword] = useState('');
  const [autoTail, setAutoTail] = useState(false);

  // 全局日志级别设置
  const [globalLevel, setGlobalLevel] = useState('info');
  const [savingGlobalLevel, setSavingGlobalLevel] = useState(false);
  const [expandedIndex, setExpandedIndex] = useState(null);

  // 1. 拉取全局日志级别
  const fetchGlobalLevel = async () => {
    try {
      const resp = await fetch('/api/admin/logs/level');
      const data = await resp.json();
      if (resp.ok && data.success) {
        setGlobalLevel(data.currentLevel);
      }
    } catch { }
  };

  // 2. 拉取日志列表
  const fetchLogs = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
        level: levelFilter,
        errorOnly: errorOnly ? 'true' : 'false',
        traceId: traceIdFilter,
        keyword,
      });

      const resp = await fetch(`/api/admin/logs?${params.toString()}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setLogs(data.logs || []);
        setTotal(data.total || 0);
        setTotalPages(data.totalPages || 1);
        if (data.meta) setMeta(data.meta);
      }
    } catch {
    } finally {
      if (!isSilent) setLoading(false);
    }
  }, [page, pageSize, levelFilter, errorOnly, traceIdFilter, keyword]);

  useEffect(() => {
    fetchGlobalLevel();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  // 3. 实时日志流 (Auto Tail)
  useEffect(() => {
    if (!autoTail) return;
    const timer = setInterval(() => {
      fetchLogs(true);
    }, 3000);
    return () => clearInterval(timer);
  }, [autoTail, fetchLogs]);

  // 4. 保存全局日志级别
  const handleSaveGlobalLevel = async () => {
    setSavingGlobalLevel(true);
    try {
      const resp = await fetch('/api/admin/logs/level', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ level: globalLevel }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert(`日志级别已切换为 [${globalLevel.toUpperCase()}]`);
        fetchGlobalLevel();
      } else {
        alert(data.error || '设置失败');
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setSavingGlobalLevel(false);
    }
  };

  // 5. 导出功能
  const handleExport = (format) => {
    const params = new URLSearchParams({
      format,
      level: levelFilter,
      errorOnly: errorOnly ? 'true' : 'false',
      traceId: traceIdFilter,
      keyword,
    });
    window.open(`/api/admin/logs/export?${params.toString()}`, '_blank');
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-white select-none">
      {/* ─── 顶部 Header 与日志级别控制卡片 ──────────────── */}
      <div className="p-6 border-b border-[#e0e0e0] bg-[#f4f4f4] flex justify-between items-center shrink-0">
        <div>
          <h2 className="text-[20px] font-light text-[#161616] mb-1">系统运行日志</h2>
          <p className="text-[12px] text-[#525252]">
            基于 Pino NDJSON 的全链路运行日志。共有 {meta.fileCount} 个日志文件，累计占用 {meta.totalFormattedSize}。
          </p>
        </div>

        <div className="flex items-center gap-3 bg-white p-3 border border-[#e0e0e0] rounded-none">
          <label className="text-[12px] text-[#161616] font-medium shrink-0">服务端输出级别:</label>
          <select
            value={globalLevel}
            onChange={(e) => setGlobalLevel(e.target.value)}
            className="h-8 px-2 bg-white border border-[#c6c6c6] text-[12px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer font-mono font-medium"
          >
            <option value="trace">TRACE (全量最详细)</option>
            <option value="debug">DEBUG (开发调试)</option>
            <option value="info">INFO (常规运维 - 推荐)</option>
            <option value="warn">WARN (仅告警与报错)</option>
            <option value="error">ERROR (仅严重错误)</option>
            <option value="fatal">FATAL (仅崩溃级故障)</option>
          </select>
          <button
            onClick={handleSaveGlobalLevel}
            disabled={savingGlobalLevel}
            className="h-8 px-4 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] font-medium cursor-pointer rounded-none border-none outline-none disabled:opacity-50"
          >
            {savingGlobalLevel ? '保存中...' : '应用级别'}
          </button>
        </div>
      </div>

      {/* ─── 第二行：筛选与控制工具栏 ───────────────────── */}
      <div className="h-16 px-6 border-b border-[#e0e0e0] bg-[#f4f4f4] flex gap-3 items-center justify-between shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          {/* 关键字输入 */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#525252] font-medium">检索:</span>
            <input
              type="text"
              value={keyword}
              onChange={(e) => { setKeyword(e.target.value); setPage(1); }}
              placeholder="关键字 / URL / 消息..."
              className="h-8 px-3 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d] w-48 font-mono"
            />
          </div>

          {/* 日志级别筛选 */}
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-[#525252] font-medium">级别:</span>
            <select
              value={levelFilter}
              onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
              className="h-8 px-2 bg-white border border-[#c6c6c6] text-[12px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer font-mono"
            >
              <option value="">全部级别</option>
              <option value="trace">TRACE</option>
              <option value="debug">DEBUG</option>
              <option value="info">INFO</option>
              <option value="warn">WARN</option>
              <option value="error">ERROR</option>
              <option value="fatal">FATAL</option>
            </select>
          </div>

          {/* TraceId 筛选 */}
          {traceIdFilter && (
            <div className="flex items-center gap-1.5 bg-[#edf5ff] border border-[#a6c8ff] px-2.5 h-8 text-[12px] text-[#0f62fe] font-mono">
              <span>TraceID: {traceIdFilter.slice(0, 8)}...</span>
              <button
                onClick={() => setTraceIdFilter('')}
                className="bg-transparent border-none text-[#0f62fe] hover:text-[#002d9c] cursor-pointer text-[14px] font-bold"
              >
                ✕
              </button>
            </div>
          )}

          {/* 快捷按钮：只看报错 */}
          <button
            onClick={() => { setErrorOnly(!errorOnly); setPage(1); }}
            className={`h-8 px-3 text-[12px] font-medium cursor-pointer rounded-none border transition-colors ${
              errorOnly
                ? 'bg-[#da1e28] text-white border-[#da1e28]'
                : 'bg-white text-[#da1e28] border-[#da1e28] hover:bg-[#fff2f0]'
            }`}
          >
            {errorOnly ? '✓ 仅看报错 (已激活)' : '⚠️ 仅看报错'}
          </button>

          {/* 重置筛选 */}
          {(keyword || levelFilter || traceIdFilter || errorOnly) && (
            <button
              onClick={() => {
                setKeyword('');
                setLevelFilter('');
                setTraceIdFilter('');
                setErrorOnly(false);
                setPage(1);
              }}
              className="h-8 px-3 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] text-[#161616] cursor-pointer rounded-none font-medium"
            >
              重置筛选
            </button>
          )}
        </div>

        {/* 右侧动作区：Auto Tail, 刷新与导出 */}
        <div className="flex items-center gap-3">
          {/* 实时日志流 (Auto Tail) 开关 */}
          <button
            onClick={() => setAutoTail(!autoTail)}
            className={`h-8 px-3 text-[12px] font-medium cursor-pointer rounded-none border flex items-center gap-1.5 transition-colors ${
              autoTail
                ? 'bg-[#24a148] text-white border-[#24a148]'
                : 'bg-white text-[#24a148] border-[#24a148] hover:bg-[#f6ffed]'
            }`}
          >
            {autoTail ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping"></span>
                <span>实时流运行中 (3s)</span>
              </>
            ) : (
              <span>⏱️ 开启实时流 (Auto Tail)</span>
            )}
          </button>

          <button
            onClick={() => fetchLogs()}
            className="h-8 px-3 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] text-[#161616] cursor-pointer rounded-none font-medium"
          >
            🔄 刷新
          </button>

          {/* 导出下拉/按钮 */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleExport('log')}
              className="h-8 px-3 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] font-medium cursor-pointer rounded-none border-none outline-none"
            >
              📥 导出 .log
            </button>
            <button
              onClick={() => handleExport('csv')}
              className="h-8 px-3 border border-[#393939] bg-white hover:bg-[#e8e8e8] text-[#393939] text-[12px] font-medium cursor-pointer rounded-none outline-none"
            >
              📊 导出 .csv
            </button>
          </div>
        </div>
      </div>

      {/* ─── 第三行：日志列表展示区 ─────────────────────── */}
      <div className="flex-1 overflow-auto min-h-0 bg-white font-mono text-[12px]">
        {loading && logs.length === 0 ? (
          <div className="p-12 text-center text-[#8d8d8d]">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-[#0f62fe] border-t-transparent rounded-full mb-2"></div>
            <p>正在加载系统日志...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-12 text-center text-[#8d8d8d]">
            <span className="text-[32px] block mb-2">📋</span>
            <p className="text-[14px] text-[#161616] font-medium">暂无匹配的日志记录</p>
            <p className="text-[12px] text-[#525252] mt-1">请尝试放宽筛选条件或在移动端/管理台执行某些功能操作。</p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#f4f4f4] border-b border-[#e0e0e0] text-[#525252] text-[11px] select-none sticky top-0 z-10">
                <th className="py-2.5 px-4 font-semibold w-48">时间 (Time)</th>
                <th className="py-2.5 px-3 font-semibold w-20">级别</th>
                <th className="py-2.5 px-3 font-semibold w-36">TraceID</th>
                <th className="py-2.5 px-3 font-semibold w-28">操作人</th>
                <th className="py-2.5 px-4 font-semibold">消息 / 请求路径 / 错误明细</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((item, idx) => {
                const badge = LEVEL_COLORS[item.level] || LEVEL_COLORS[30];
                const isExpanded = expandedIndex === idx;

                return (
                  <tr
                    key={idx}
                    onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                    className={`border-b border-[#e0e0e0] cursor-pointer transition-colors ${
                      isExpanded ? 'bg-[#edf5ff]' : 'hover:bg-[#f4f4f4]'
                    } ${item.level >= 50 ? 'bg-[#fff2f0]' : ''}`}
                  >
                    <td className="py-2.5 px-4 text-[#525252] whitespace-nowrap align-top">
                      {item.time ? item.time.replace('T', ' ').slice(0, 23) : '-'}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap align-top">
                      <span
                        className="inline-block px-1.5 py-0.5 text-[10px] font-bold rounded-none"
                        style={{ backgroundColor: badge.bg, color: badge.text }}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap align-top">
                      {item.traceId ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setTraceIdFilter(item.traceId);
                            setPage(1);
                          }}
                          className="text-[#0f62fe] hover:underline bg-transparent border-none p-0 cursor-pointer font-mono text-[11px]"
                          title="点击快速筛选同一次 HTTP 请求的所有日志"
                        >
                          {item.traceId.slice(0, 8)}...
                        </button>
                      ) : (
                        <span className="text-[#8d8d8d]">-</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap align-top text-[#161616]">
                      {item.uploaded_by || '-'}
                    </td>
                    <td className="py-2.5 px-4 text-[#161616] align-top break-all">
                      <div className="flex items-center gap-2">
                        {item.method && (
                          <span className="font-semibold text-[#0f62fe]">{item.method}</span>
                        )}
                        {item.url && <span className="text-[#525252]">{item.url}</span>}
                        <span>{item.msg}</span>
                      </div>

                      {/* 错误堆栈/对象摘要 */}
                      {item.err && (
                        <div className="mt-1 p-2 bg-[#fff2f0] border border-[#ffccc7] text-[#da1e28] text-[11px] font-mono leading-relaxed">
                          ⚠️ {item.err.message || JSON.stringify(item.err)}
                        </div>
                      )}

                      {/* 点击展开完整的 JSON 对象 */}
                      {isExpanded && (
                        <div className="mt-3 p-3 bg-[#161616] text-[#24a148] overflow-x-auto text-[11px] leading-relaxed rounded-none select-text">
                          <pre>{JSON.stringify(item, null, 2)}</pre>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* ─── 第四行：分页控制栏 ─────────────────────────── */}
      <div className="h-14 px-6 border-t border-[#e0e0e0] bg-[#f4f4f4] flex justify-between items-center text-[12px] text-[#525252] shrink-0 select-none">
        <div className="flex items-center gap-3">
          <span>共 <strong className="font-mono text-[#161616]">{total}</strong> 条记录</span>
          <span>页码 <strong className="font-mono text-[#161616]">{page} / {totalPages}</strong></span>
          <select
            value={pageSize}
            onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-7 px-2 bg-white border border-[#c6c6c6] text-[12px] outline-none rounded-none cursor-pointer"
          >
            <option value={20}>20 条/页</option>
            <option value={50}>50 条/页</option>
            <option value={100}>100 条/页</option>
            <option value={200}>200 条/页</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="h-8 px-3 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] disabled:opacity-40 text-[12px] cursor-pointer rounded-none font-medium"
          >
            上一页
          </button>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="h-8 px-3 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] disabled:opacity-40 text-[12px] cursor-pointer rounded-none font-medium"
          >
            下一页
          </button>
        </div>
      </div>
    </div>
  );
}
