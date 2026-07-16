'use client';

/**
 * 管理后台主控制台页面 (Client Component)
 *
 * 经典 IBM Carbon 宽屏矩阵拓扑布局重构版：
 *   - 顶层 Tab 简化为三大日常面板：生产控制大盘 (dashboard)、成员管理 (users)、系统设置 (settings)
 *   - 【生产控制大盘】高度集成：
 *     - 顶部：看板数据看板 StatsBar
 *     - 大分幅区：左 1/4 PipelineTree 导航树 + 右 3/4 核心工作区
 *     - 导航树内置：导入 Excel 弹窗触发、批量打印链接、每行 Hover 二维码弹窗查看 [QR]
 *     - 右侧工作区内置视图切换 Toggle：无缝切换【焊口矩阵列表视图】与【云端 OSS 目录树浏览器】
 */

import { useState, useEffect } from 'react';
import StatsBar from '@/components/StatsBar';
import PipelineTree from '@/components/PipelineTree';
import WeldMatrix from '@/components/WeldMatrix';
import OSSFileTree from '@/components/OSSFileTree';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, users, settings
  const [rightView, setRightView] = useState('matrix'); // matrix, oss (控制大盘右侧视图)

  // ─── 全局数据状态 ───────────────────────────────────────
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0 });
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipeline, setSelectedPipeline] = useState('');
  const [weldRecords, setWeldRecords] = useState([]);

  // 焊口过滤条件
  const [filterWeld, setFilterWeld] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // 成员与设置数据
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);

  // ─── 弹窗 Modals 状态 ───────────────────────────────────
  // 1. Excel 导入弹窗
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importResult, setImportResult] = useState(null);

  // 2. 单个二维码查看弹窗
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPipelineNo, setQrPipelineNo] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [qrData, setQrData] = useState({ qr: '', url: '' });

  // 3. 添加新成员弹窗
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newRole, setNewRole] = useState('worker');

  // 4. 编辑成员弹窗
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editUserId, setEditUserId] = useState(null);
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editRole, setEditRole] = useState('worker');

  // ─── 数据拉取 ──────────────────────────────────────────
  const fetchStats = async () => {
    try {
      const resp = await fetch('/api/admin/stats');
      const data = await resp.json();
      if (resp.ok && data.success) setStats(data.stats);
    } catch {}
  };

  const fetchPipelines = async () => {
    try {
      const resp = await fetch('/api/admin/pipelines');
      const data = await resp.json();
      if (resp.ok && data.success) {
        setPipelines(data.pipelines);
        // 如果当前没有选中管线，默认选中第一个
        if (data.pipelines.length > 0 && !selectedPipeline) {
          setSelectedPipeline(data.pipelines[0].pipeline_no);
        }
      }
    } catch {}
  };

  const fetchRecords = async (pipelineNo) => {
    if (!pipelineNo) return;
    const params = new URLSearchParams();
    params.set('pipeline_no', pipelineNo);
    if (filterWeld) params.set('weld_no', filterWeld);
    if (filterStatus) params.set('status', filterStatus);

    try {
      const resp = await fetch(`/api/admin/records?${params.toString()}`);
      const data = await resp.json();
      if (resp.ok && data.success) setWeldRecords(data.records);
    } catch {}
  };

  const fetchUsers = async () => {
    try {
      const resp = await fetch('/api/admin/users');
      const data = await resp.json();
      if (resp.ok && data.success) setUsers(data.users);
    } catch {}
  };

  const fetchSettings = async () => {
    try {
      const resp = await fetch('/api/admin/settings');
      const data = await resp.json();
      if (resp.ok && data.success) setSettings(data);
    } catch {}
  };

  // ─── 联动拉取 ──────────────────────────────────────────
  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchStats();
      fetchPipelines();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'settings') {
      fetchSettings();
    }
  }, [activeTab]);

  useEffect(() => {
    if (selectedPipeline) {
      fetchRecords(selectedPipeline);
    }
  }, [selectedPipeline, filterWeld, filterStatus]);

  // ─── 单个二维码弹窗加载 ──────────────────────────────────
  const handleOpenQRModal = async (pipelineNo) => {
    setQrPipelineNo(pipelineNo);
    setQrLoading(true);
    setQrData({ qr: '', url: '' });
    setShowQRModal(true);

    try {
      const resp = await fetch(`/api/admin/qrcode/${encodeURIComponent(pipelineNo)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setQrData({ qr: data.qr, url: data.url });
      } else {
        alert(data.error || '二维码获取失败');
        setShowQRModal(false);
      }
    } catch {
      alert('网络连接错误');
      setShowQRModal(false);
    } finally {
      setQrLoading(false);
    }
  };

  const handleDownloadQR = () => {
    if (!qrData.qr) return;
    const a = document.createElement('a');
    a.href = qrData.qr;
    a.download = `QR_${qrPipelineNo}.png`;
    a.click();
  };

  // ─── Excel 导入逻辑 ─────────────────────────────────────
  const handleImportExcel = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImportStatus('正在解析并导入数据，请稍候...');
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await fetch('/api/admin/import', {
        method: 'POST',
        body: formData,
      });
      const data = await resp.json();
      setImportStatus('');

      if (resp.ok && data.success) {
        setImportResult({
          success: true,
          total: data.total,
          inserted: data.inserted,
          skipped: data.skipped,
        });
        // 自动刷新大盘及管线
        fetchStats();
        fetchPipelines();
      } else {
        setImportResult({
          success: false,
          error: data.error || '数据导入失败，请检查文件格式。',
        });
      }
    } catch {
      setImportStatus('');
      setImportResult({ success: false, error: '网络连接异常，文件传输中断。' });
    }
    e.target.value = '';
  };

  // ─── 成员管理逻辑 ───────────────────────────────────────
  const handleAddUser = async (e) => {
    e.preventDefault();
    if (!newUsername || !newPassword) {
      alert('用户名和密码不能为空');
      return;
    }
    try {
      const resp = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          role: newRole,
          display_name: newDisplayName,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setShowAddUserModal(false);
        setNewUsername('');
        setNewPassword('');
        setNewDisplayName('');
        setNewRole('worker');
        fetchUsers();
      } else {
        alert(data.error || '添加失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  const handleOpenEditModal = (user) => {
    setEditUserId(user.id);
    setEditUsername(user.username);
    setEditDisplayName(user.display_name || '');
    setEditRole(user.role);
    setEditPassword('');
    setShowEditUserModal(true);
  };

  const handleEditUser = async (e) => {
    e.preventDefault();
    if (!editUsername || !editUsername.trim()) {
      alert('用户名不能为空');
      return;
    }
    try {
      const resp = await fetch(`/api/admin/users/${editUserId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: editUsername.trim(),
          password: editPassword,
          role: editRole,
          display_name: editDisplayName,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setShowEditUserModal(false);
        fetchUsers();
      } else {
        alert(data.error || '修改失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  const handleDeleteUser = async (id) => {
    if (!confirm('确定删除该用户？')) return;
    try {
      const resp = await fetch(`/api/admin/users/${id}`, { method: 'DELETE' });
      const data = await resp.json();
      if (resp.ok && data.success) {
        fetchUsers();
      } else {
        alert(data.error || '删除失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-48px)] overflow-hidden font-sans bg-white">
      {/* 顶部 Tab 选项导航 (三栏化整合) */}
      <nav className="flex border-b border-[#e0e0e0] px-6 select-none bg-white">
        {[
          { id: 'dashboard', name: '生产控制大盘' },
          { id: 'users', name: '成员管理' },
          { id: 'settings', name: '系统设置' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-12 px-6 text-[14px] font-normal tracking-[0.16px] border-b-2 transition-all duration-150 cursor-pointer outline-none bg-transparent
              ${
                activeTab === tab.id
                  ? 'border-[#0f62fe] text-[#0f62fe] font-semibold'
                  : 'border-transparent text-[#525252] hover:text-[#161616]'
              }
            `}
          >
            {tab.name}
          </button>
        ))}
      </nav>

      {/* 主面板内容区 */}
      <div className="flex-1 overflow-y-auto bg-white">
        {/* Panel: 生产控制大盘 */}
        {activeTab === 'dashboard' && (
          <div className="p-6 h-full flex flex-col min-h-0">
            {/* 看板 */}
            <StatsBar stats={stats} />

            {/* 控制大盘分栏区 */}
            <div className="flex-1 flex border border-[#e0e0e0] bg-white min-h-0">
              {/* 左侧管线树导航 (整合了导入按钮、二维码弹窗逻辑) */}
              <PipelineTree
                pipelines={pipelines}
                selectedPipeline={selectedPipeline}
                onSelectPipeline={setSelectedPipeline}
                onImportClick={() => {
                  setImportResult(null);
                  setImportStatus('');
                  setShowImportModal(true);
                }}
                onShowQR={handleOpenQRModal}
              />

              {/* 右侧核心工作区 (整合了 WeldMatrix 和 OSSFileTree) */}
              <div className="flex-1 flex flex-col min-h-0 bg-white">
                {/* 顶部控制栏：提供列表视图与文件浏览器 Toggle 切换 */}
                <div className="p-4 border-b border-[#e0e0e0] bg-[#f4f4f4] flex justify-between items-center flex-wrap select-none gap-4">
                  {/* 视图切换 Toggle 键 */}
                  <div className="flex border border-[#c6c6c6] bg-white">
                    <button
                      onClick={() => setRightView('matrix')}
                      className={`h-8 px-4 text-[12px] cursor-pointer outline-none border-none transition-colors duration-150
                        ${
                          rightView === 'matrix'
                            ? 'bg-[#0f62fe] text-white font-medium'
                            : 'bg-transparent text-[#525252] hover:text-[#161616] hover:bg-[#e8e8e8]'
                        }
                      `}
                    >
                      焊口矩阵列表
                    </button>
                    <button
                      onClick={() => setRightView('oss')}
                      className={`h-8 px-4 text-[12px] cursor-pointer outline-none border-none transition-colors duration-150
                        ${
                          rightView === 'oss'
                            ? 'bg-[#0f62fe] text-white font-medium'
                            : 'bg-transparent text-[#525252] hover:text-[#161616] hover:bg-[#e8e8e8]'
                        }
                      `}
                    >
                      云端归档浏览器 (OSS)
                    </button>
                  </div>

                  {/* 针对列表视图展示过滤参数 */}
                  {rightView === 'matrix' && (
                    <div className="flex gap-4 items-center flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#525252]">焊口号:</span>
                        <input
                          type="text"
                          value={filterWeld}
                          onChange={(e) => setFilterWeld(e.target.value)}
                          placeholder="模糊搜索..."
                          className="h-8 px-2 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[12px] text-[#525252]">状态:</span>
                        <select
                          value={filterStatus}
                          onChange={(e) => setFilterStatus(e.target.value)}
                          className="h-8 px-2 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                        >
                          <option value="">全部状态</option>
                          <option value="completed">已完成</option>
                          <option value="pending">待录入</option>
                        </select>
                      </div>
                      <button
                        onClick={() => {
                          setFilterWeld('');
                          setFilterStatus('');
                        }}
                        className="h-8 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] text-[#161616] cursor-pointer rounded-none font-medium"
                      >
                        重置筛选
                      </button>
                    </div>
                  )}
                </div>

                {/* 视图内容切换 */}
                {rightView === 'matrix' ? (
                  <WeldMatrix records={weldRecords} />
                ) : (
                  <div className="p-6 overflow-y-auto h-full min-h-0 bg-white">
                    <OSSFileTree />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Panel: 用户成员管理 */}
        {activeTab === 'users' && (
          <div className="p-6">
            <div className="border border-[#e0e0e0] p-6 bg-white rounded-none">
              <div className="flex justify-between items-center mb-6 select-none">
                <div>
                  <h2 className="text-[20px] font-light text-[#161616]">成员管理</h2>
                  <p className="text-[13px] text-[#525252] mt-1">
                    创建和维护施工员及管理员账户权限。💡 提示：以 anon_ 开头的简易设备账户若连续三个月（90天）未登录，系统将自动进行销号清理。
                  </p>
                </div>
                <button
                  onClick={() => setShowAddUserModal(true)}
                  className="h-10 px-5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium"
                >
                  + 添加新成员
                </button>
              </div>

              <div className="overflow-x-auto select-none">
                <table className="w-full border-collapse text-[13px] text-left">
                  <thead>
                    <tr className="border-b border-[#c6c6c6] text-[#525252] font-semibold">
                      <th className="pb-3 pr-4 font-medium">账号 ID</th>
                      <th className="pb-3 px-4 font-medium">用户名</th>
                      <th className="pb-3 px-4 font-medium">姓名</th>
                      <th className="pb-3 px-4 font-medium">权限角色</th>
                      <th className="pb-3 px-4 font-medium">加入时间</th>
                      <th className="pb-3 px-4 font-medium">最后登录时间</th>
                      <th className="pb-3 pl-4 font-medium text-right">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e0e0e0] text-[#161616]">
                    {users.map((u) => (
                      <tr key={u.id} className="hover:bg-[#f4f4f4]">
                        <td className="py-3 pr-4 font-mono">{u.id}</td>
                        <td className="py-3 px-4 font-mono font-medium">{u.username}</td>
                        <td className="py-3 px-4">{u.display_name || '-'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] rounded-none
                              ${
                                u.role === 'admin'
                                  ? 'bg-[#edf5ff] text-[#0f62fe]'
                                  : 'bg-[#f4f4f4] text-[#525252]'
                              }
                            `}
                          >
                            {u.role === 'admin' ? '系统管理员' : '施工员'}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-[#525252]">{u.created_at}</td>
                        <td className="py-3 px-4 font-mono text-[#525252]">{u.last_login_at || '-'}</td>
                        <td className="py-3 pl-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              className="px-3 py-1 bg-transparent hover:bg-[#0f62fe]/10 text-[#0f62fe] border border-[#0f62fe] text-[12px] cursor-pointer rounded-none transition-colors duration-150 font-medium"
                            >
                              编辑
                            </button>
                            {u.username === 'admin' ? (
                              <span className="text-[#8d8d8d] text-[11px] font-mono leading-7">固有账户</span>
                            ) : (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="px-3 py-1 bg-transparent hover:bg-[#da1e28]/10 text-[#da1e28] border border-[#da1e28] text-[12px] cursor-pointer rounded-none transition-colors duration-150"
                              >
                                删除
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Panel: 系统设置 */}
        {activeTab === 'settings' && settings && (
          <div className="p-6 max-w-4xl select-none">
            <div className="border border-[#e0e0e0] p-6 bg-white rounded-none">
              <h2 className="text-[20px] font-light text-[#161616] mb-6">系统配置概览</h2>

              <div className="space-y-6">
                <div className="border-b border-[#e0e0e0] pb-4">
                  <span className="text-[12px] text-[#525252] block mb-1">后端文件管理模式</span>
                  <span className="text-[14px] font-mono font-semibold text-[#0f62fe] bg-[#edf5ff] px-2.5 py-1 inline-block">
                    {settings.config.exportMode} (云端对象存储桶直传)
                  </span>
                  <p className="text-[12px] text-[#8d8d8d] mt-2">
                    大容量照片流直接通过客户端直接上传至 OSS 存储桶，完全跳过 Next.js 服务器中转，极速且节省宿主机负荷。
                  </p>
                </div>

                <div className="border-b border-[#e0e0e0] pb-4">
                  <span className="text-[12px] text-[#525252] block mb-1">云端 OSS 桶详情 (已脱敏)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 font-mono text-[13px] bg-[#f4f4f4] p-4 border border-[#e0e0e0]">
                    <div><span className="text-[#525252]">Bucket:</span> {settings.config.oss.bucket || '-'}</div>
                    <div><span className="text-[#525252]">Region:</span> {settings.config.oss.region || '-'}</div>
                    <div className="md:col-span-2 truncate" title={settings.config.oss.endpoint}>
                      <span className="text-[#525252]">Endpoint:</span> {settings.config.oss.endpoint || '-'}
                    </div>
                    <div className="md:col-span-2">
                      <span className="text-[#525252]">AccessKeyId:</span> {settings.config.oss.accessKeyId || '-'}
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[12px] text-[#525252] block mb-1.5">当前局域网服务访问地址</span>
                  <div className="space-y-1">
                    {settings.serverIPs.map((ip) => (
                      <div key={ip} className="font-mono text-[14px] text-[#161616]">
                        • <a href={`http://${ip}:${settings.port}`} target="_blank" className="text-[#0f62fe] hover:underline font-semibold">http://{ip}:{settings.port}</a>
                      </div>
                    ))}
                  </div>
                  <p className="text-[12px] text-[#8d8d8d] mt-2">
                    请确保移动设备与宿主机连接到相同的 WiFi 局域网络环境，扫码功能方可正常交互。
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL 1: Excel 导入弹窗 ───────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[600px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#e0e0e0]">
              <h3 className="text-[18px] font-light text-[#161616]">导入管线焊口 Excel</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-transparent border-none text-[#525252] hover:text-[#161616] text-[18px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[13px] text-[#525252] mb-4">
              上传 `.xlsx` 格式的焊口清单，系统会自动将管线焊口元数据入库。<br />
              数据表必须包含：<strong className="text-[#161616]">管线号、焊口号</strong>两列（表头列名支持包含关键字模糊匹配）。
            </p>

            <div
              onClick={() => document.getElementById('modalExcelInput').click()}
              className="border-2 border-dashed border-[#c6c6c6] hover:border-[#0f62fe] bg-[#f4f4f4] py-8 text-center cursor-pointer transition-colors duration-150"
            >
              <div className="text-[28px] mb-1">📎</div>
              <div className="text-[13px] text-[#161616] font-medium">点击选择或拖入 Excel 文件</div>
            </div>
            <input
              type="file"
              id="modalExcelInput"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
            />

            {importStatus && (
              <div className="mt-3 p-2 bg-[#edf5ff] text-[#0f62fe] text-[12px] font-mono">
                {importStatus}
              </div>
            )}

            {importResult && (
              <div className="mt-4">
                {importResult.success ? (
                  <div className="p-3 bg-[#24a148]/10 border border-[#24a148] text-[#24a148] text-[13px]">
                    <strong>🎉 导入成功！</strong>
                    <span className="font-mono ml-2">行数: {importResult.total} | 新增: {importResult.inserted} | 重复跳过: {importResult.skipped}</span>
                  </div>
                ) : (
                  <div className="p-3 bg-[#da1e28]/10 border border-[#da1e28] text-[#da1e28] text-[13px]">
                    <strong>⚠️ 导入失败：</strong> {importResult.error}
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-end pt-4 border-t border-[#e0e0e0] mt-6">
              <button
                onClick={() => setShowImportModal(false)}
                className="h-9 px-5 bg-[#393939] hover:bg-[#4c4c4c] text-white text-[12px] cursor-pointer rounded-none border-none outline-none"
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: 单个管线二维码查看弹窗 ───────────────── */}
      {showQRModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none text-center">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#e0e0e0] text-left">
              <h3 className="text-[18px] font-light text-[#161616]">管线二维码</h3>
              <button
                onClick={() => setShowQRModal(false)}
                className="bg-transparent border-none text-[#525252] hover:text-[#161616] text-[18px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="font-mono font-semibold text-[15px] text-[#161616] mb-4 text-left">
              管线号: {qrPipelineNo}
            </div>

            <div className="w-64 h-64 mx-auto bg-white border border-[#e0e0e0] flex items-center justify-center p-2">
              {qrLoading ? (
                <div className="text-[12px] text-[#8d8d8d] font-mono">正在生成二维码...</div>
              ) : qrData.qr ? (
                <img src={qrData.qr} alt={qrPipelineNo} className="w-full h-full object-contain" />
              ) : (
                <div className="text-[12px] text-[#da1e28] font-mono">生成失败</div>
              )}
            </div>

            {!qrLoading && qrData.url && (
              <div className="mt-3 text-[11px] text-[#8d8d8d] font-mono break-all text-left">
                链接: {qrData.url}
              </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0] mt-6">
              <button
                onClick={() => setShowQRModal(false)}
                className="h-9 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] cursor-pointer rounded-none"
              >
                取消
              </button>
              <button
                onClick={handleDownloadQR}
                disabled={qrLoading || !qrData.qr}
                className="h-9 px-5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] cursor-pointer rounded-none border-none outline-none font-medium disabled:bg-[#8d8d8d]"
              >
                下载二维码
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── MODAL 3: 添加成员弹窗 ───────────────────────── */}
      {showAddUserModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <h3 className="text-[18px] font-light text-[#161616] mb-4">添加系统新成员</h3>
            
            <form onSubmit={handleAddUser} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">用户名</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="登录账号"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">登录密码</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="登录密码"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">成员姓名</label>
                <input
                  type="text"
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="真实姓名（留空默认为账号名）"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">所属角色</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] text-[13px] outline-none rounded-none cursor-pointer"
                >
                  <option value="worker">施工人员</option>
                  <option value="admin">系统管理员</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0] mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  className="h-9 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] cursor-pointer rounded-none"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] cursor-pointer rounded-none border-none outline-none font-medium"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 4: 编辑成员弹窗 ───────────────────────── */}
      {showEditUserModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[400px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <h3 className="text-[18px] font-light text-[#161616] mb-4">编辑系统成员信息</h3>
            
            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">用户名</label>
                <input
                  type="text"
                  required
                  disabled={editUsername.startsWith('anon_')}
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value)}
                  placeholder="登录账号"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none disabled:opacity-50"
                />
                {editUsername.startsWith('anon_') && (
                  <span className="text-[11px] text-[#da1e28] mt-1 leading-normal">
                    💡 提示：简易设备账户的用户名作为唯一特征，禁止修改。
                  </span>
                )}
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">登录密码</label>
                <input
                  type="password"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="新密码 (留空表示不修改)"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">成员姓名</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  placeholder="真实姓名"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">所属角色</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] text-[13px] outline-none rounded-none cursor-pointer"
                >
                  <option value="worker">施工人员</option>
                  <option value="admin">系统管理员</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0] mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditUserModal(false)}
                  className="h-9 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] cursor-pointer rounded-none"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] cursor-pointer rounded-none border-none outline-none font-medium"
                >
                  保存修改
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
