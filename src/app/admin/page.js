'use client';

/**
 * 管理后台主控制台页面 (Client Component)
 *
 * 经典 IBM Carbon 宽屏矩阵拓扑布局重构版：
 *   - 顶层 Tab 简化为三大日常面板：管道焊口总览 (dashboard)、成员管理 (users)、系统设置 (settings)
 *   - 【管道焊口总览】管理的起点是项目：
 *     - 未选中项目时：展示全局项目列表，支持按施工号/名称过滤与按创建时间排序，管理员可增删改项目。
 *     - 选中项目后：列表收起，顶部展示面包屑导航“项目控制台 / 🏗️ 施工号: XXX (XXX)”。
 *       展示看板数据 StatsBar，左侧 PipelineTree + 右侧 WeldMatrix。
 *       支持直接网页端扫码、直传、驳回重传、批量删除熔断和 JSZip+FileSaver 客户端零服务器负载批量打包。
 */

import { useState, useEffect } from 'react';
import StatsBar from '@/components/StatsBar';
import PipelineTree from '@/components/PipelineTree';
import WeldMatrix from '@/components/WeldMatrix';
import LogViewer from '@/components/LogViewer';
import { addLogoToQRCode } from '@/lib/qrLogo';

function formatDatetimeLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`;
}

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState('dashboard'); // dashboard, users, settings

  // ─── 用户角色状态 ───────────────────────────────────────
  const [currentUser, setCurrentUser] = useState(null);

  // ─── 项目相关状态 ───────────────────────────────────────
  const [projectsList, setProjectsList] = useState([]);
  const [selectedProjectUuid, setSelectedProjectUuid] = useState('');
  const [selectedProject, setSelectedProject] = useState(null);

  // 项目过滤与排序
  const [filterProjectQuery, setFilterProjectQuery] = useState('');
  const [sortProjectOrder, setSortProjectOrder] = useState('created_desc'); // created_desc, created_asc, name

  // 项目弹窗
  const [showAddProjectModal, setShowAddProjectModal] = useState(false);
  const [newConstructionNo, setNewConstructionNo] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [newRemark, setNewRemark] = useState('');
  const [newPipelinePrefix, setNewPipelinePrefix] = useState('');
  const [newWeldPrefix, setNewWeldPrefix] = useState('');

  const [showEditProjectModal, setShowEditProjectModal] = useState(false);
  const [editProjectUuid, setEditProjectUuid] = useState('');
  const [editConstructionNo, setEditConstructionNo] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editRemark, setEditRemark] = useState('');
  const [editPipelinePrefix, setEditPipelinePrefix] = useState('');
  const [editWeldPrefix, setEditWeldPrefix] = useState('');
  const [editProjectStatus, setEditProjectStatus] = useState('进行中');

  // ─── 项目级详情状态 ─────────────────────────────────────
  const [stats, setStats] = useState({ total: 0, completed: 0, pending: 0 });
  const [pipelines, setPipelines] = useState([]);
  const [selectedPipelineUuid, setSelectedPipelineUuid] = useState('');
  const [selectedPipelineNo, setSelectedPipelineNo] = useState('');
  const [selectedPipelineUuids, setSelectedPipelineUuids] = useState([]);
  const [weldRecords, setWeldRecords] = useState([]);
  const [exportingExcel, setExportingExcel] = useState(false);

  // 焊口过滤条件
  const [filterWeld, setFilterWeld] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [uploadStartDate, setUploadStartDate] = useState('');
  const [uploadEndDate, setUploadEndDate] = useState('');
  const [is24hActive, setIs24hActive] = useState(false);

  // 避免 setInterval 闭包陈旧问题：使用 ref 实时维持当前最新过滤状态
  const filtersRef = useRef({ filterWeld, filterStatus });
  useEffect(() => {
    filtersRef.current = { filterWeld, filterStatus };
  }, [filterWeld, filterStatus]);

  // 成员与设置数据
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState(null);

  // ─── 照片压缩参数状态 ───────────────────────────────────
  const [compressEnabled, setCompressEnabled] = useState(true);
  const [compressMaxWidth, setCompressMaxWidth] = useState(1920);
  const [compressMaxHeight, setCompressMaxHeight] = useState(1080);
  const [compressQuality, setCompressQuality] = useState(0.8);
  const [savingCompression, setSavingCompression] = useState(false);
  const [serverPublicUrl, setServerPublicUrl] = useState('');

  // ─── 弹窗 Modals 状态 ───────────────────────────────────
  // 1. Excel 导入弹窗
  const [showImportModal, setShowImportModal] = useState(false);
  const [importStatus, setImportStatus] = useState('');
  const [importResult, setImportResult] = useState(null);

  // 2. 单个管线二维码查看弹窗
  const [showQRModal, setShowQRModal] = useState(false);
  const [qrPipelineUuid, setQrPipelineUuid] = useState('');
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
  const fetchAuth = async () => {
    try {
      const resp = await fetch('/api/auth/check');
      const data = await resp.json();
      if (!data.logged_in || (data.user.role !== 'admin' && data.user.role !== 'project_admin')) {
        window.location.href = '/login';
        return;
      }
      setCurrentUser(data.user);
    } catch {
      window.location.href = '/login';
    }
  };

  const fetchProjects = async () => {
    try {
      const resp = await fetch('/api/admin/projects');
      const data = await resp.json();
      if (resp.ok && data.success) {
        setProjectsList(data.projects || []);
      }
    } catch { }
  };

  const fetchStats = async (projectUuid) => {
    if (!projectUuid) return;
    try {
      const resp = await fetch(`/api/admin/stats?project_uuid=${projectUuid}`);
      const data = await resp.json();
      if (resp.ok && data.success) setStats(data.stats);
    } catch { }
  };

  const fetchPipelines = async (projectUuid) => {
    if (!projectUuid) return;
    try {
      const resp = await fetch(`/api/admin/pipelines?project_uuid=${projectUuid}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        setPipelines(data.pipelines || []);

        // 如果当前没有选中管线，且有管线数据，默认选中第一个
        if (data.pipelines && data.pipelines.length > 0 && !selectedPipelineUuid) {
          const first = data.pipelines[0];
          setSelectedPipelineUuid(first.uuid);
          setSelectedPipelineNo(first.pipeline_no);
        }
      }
    } catch { }
  };

  const fetchRecords = async (pipelineUuid, overrideWeld, overrideStatus) => {
    if (!pipelineUuid) {
      setWeldRecords([]);
      return;
    }
    const currentWeld = overrideWeld !== undefined ? overrideWeld : filtersRef.current.filterWeld;
    const currentStatus = overrideStatus !== undefined ? overrideStatus : filtersRef.current.filterStatus;

    const params = new URLSearchParams();
    params.set('pipeline_uuid', pipelineUuid);
    if (currentWeld) params.set('weld_no', currentWeld);
    if (currentStatus) params.set('status', currentStatus);

    try {
      const resp = await fetch(`/api/admin/records?${params.toString()}`);
      const data = await resp.json();
      if (resp.ok && data.success) setWeldRecords(data.records || []);
    } catch { }
  };

  const fetchUsers = async () => {
    try {
      const resp = await fetch('/api/admin/users');
      const data = await resp.json();
      if (resp.ok && data.success) setUsers(data.users || []);
    } catch { }
  };

  const fetchSettings = async () => {
    try {
      const resp = await fetch('/api/admin/settings');
      const data = await resp.json();
      if (resp.ok && data.success) {
        setSettings(data);
        if (data.config) {
          if (data.config.compression) {
            setCompressEnabled(data.config.compression.enabled);
            setCompressMaxWidth(data.config.compression.maxWidth);
            setCompressMaxHeight(data.config.compression.maxHeight);
            setCompressQuality(data.config.compression.quality);
          }
          setServerPublicUrl(data.config.server_public_url || '');
        }
      }
    } catch { }
  };

  const handleSaveCompression = async () => {
    setSavingCompression(true);
    try {
      const resp = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          server_public_url: serverPublicUrl,
          compression: {
            enabled: compressEnabled,
            maxWidth: compressMaxWidth,
            maxHeight: compressMaxHeight,
            quality: compressQuality,
          },
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        alert('系统配置保存成功！');
        fetchSettings();
      } else {
        alert(data.error || '保存失败');
      }
    } catch {
      alert('网络连接错误');
    } finally {
      setSavingCompression(false);
    }
  };

  // ─── 联动拉取 ──────────────────────────────────────────
  useEffect(() => {
    fetchAuth();
  }, []);

  useEffect(() => {
    if (activeTab === 'dashboard') {
      fetchProjects();
      if (selectedProjectUuid) {
        fetchStats(selectedProjectUuid);
        fetchPipelines(selectedProjectUuid);
      }
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'settings') {
      fetchSettings();
    }
  }, [activeTab, selectedProjectUuid]);

  useEffect(() => {
    if (selectedPipelineUuid) {
      fetchRecords(selectedPipelineUuid);
    } else {
      setWeldRecords([]);
    }
  }, [selectedPipelineUuid, filterWeld, filterStatus]);

  // ─── 默认 60s 自动刷新定时轮询 ─────────────────────────
  useEffect(() => {
    if (!selectedPipelineUuid) return;

    const timer = setInterval(() => {
      fetchRecords(selectedPipelineUuid);
      fetchStats(selectedProjectUuid);
    }, 60000);

    return () => clearInterval(timer);
  }, [selectedPipelineUuid, selectedProjectUuid]);

  // ─── 项目增删改操作 ──────────────────────────────────────
  const handleSelectProject = (project) => {
    setSelectedProjectUuid(project.uuid);
    setSelectedProject(project);
    setSelectedPipelineUuid('');
    setSelectedPipelineNo('');
    setWeldRecords([]);
    setFilterWeld('');
    setFilterStatus('');
  };

  const handleBackToProjectConsole = () => {
    setSelectedProjectUuid('');
    setSelectedProject(null);
    setSelectedPipelineUuid('');
    setSelectedPipelineNo('');
    setWeldRecords([]);
    fetchProjects();
  };

  const handleAddProject = async (e) => {
    e.preventDefault();
    if (!newConstructionNo.trim() || !newProjectName.trim()) {
      alert('施工号和项目名称为必填项');
      return;
    }

    try {
      const resp = await fetch('/api/admin/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construction_no: newConstructionNo,
          project_name: newProjectName,
          remark: newRemark,
          pipeline_prefix: newPipelinePrefix,
          weld_prefix: newWeldPrefix,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setShowAddProjectModal(false);
        setNewConstructionNo('');
        setNewProjectName('');
        setNewRemark('');
        setNewPipelinePrefix('');
        setNewWeldPrefix('');
        fetchProjects();
      } else {
        alert(data.error || '添加失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  const handleOpenEditProject = (p, e) => {
    e.stopPropagation(); // 阻止触发选中项目
    setEditProjectUuid(p.uuid);
    setEditConstructionNo(p.construction_no);
    setEditProjectName(p.project_name);
    setEditRemark(p.remark || '');
    setEditPipelinePrefix(p.pipeline_prefix || '');
    setEditWeldPrefix(p.weld_prefix || '');
    setEditProjectStatus(p.status || '进行中');
    setShowEditProjectModal(true);
  };

  const handleEditProject = async (e) => {
    e.preventDefault();
    if (!editConstructionNo.trim() || !editProjectName.trim()) {
      alert('施工号和项目名称为必填项');
      return;
    }

    try {
      const resp = await fetch(`/api/admin/projects/${editProjectUuid}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          construction_no: editConstructionNo,
          project_name: editProjectName,
          remark: editRemark,
          pipeline_prefix: editPipelinePrefix,
          weld_prefix: editWeldPrefix,
          status: editProjectStatus,
        }),
      });
      const data = await resp.json();
      if (resp.ok && data.success) {
        setShowEditProjectModal(false);
        fetchProjects();
      } else {
        alert(data.error || '修改失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  const handleDeleteProject = async (uuid, e) => {
    e.stopPropagation();
    if (!confirm('💥 警告：删除项目将彻底删除其包含的全部管线、焊口以及绑定的照片映射！此操作无法恢复。确认删除？')) return;

    try {
      const resp = await fetch(`/api/admin/projects/${uuid}`, { method: 'DELETE' });
      const data = await resp.json();
      if (resp.ok && data.success) {
        fetchProjects();
      } else {
        alert(data.error || '删除项目失败');
      }
    } catch {
      alert('网络连接错误');
    }
  };

  // ─── 二维码弹窗加载 ─────────────────────────────────────
  const handleOpenQRModal = async (pipelineUuid) => {
    const pipeline = pipelines.find(p => p.uuid === pipelineUuid);
    if (!pipeline) return;

    setQrPipelineUuid(pipelineUuid);
    setQrPipelineNo(pipeline.pipeline_no);
    setQrLoading(true);
    setQrData({ qr: '', url: '', project_name: '', construction_no: '' });
    setShowQRModal(true);

    try {
      const resp = await fetch(`/api/admin/qrcode/${encodeURIComponent(pipelineUuid)}`);
      const data = await resp.json();
      if (resp.ok && data.success) {
        const qrWithLogo = await addLogoToQRCode(data.qr, '/logo_zpje.jpg');
        setQrData({
          qr: qrWithLogo,
          url: data.url,
          project_name: data.project_name || selectedProject?.project_name || '',
          construction_no: data.construction_no || selectedProject?.construction_no || '',
        });
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
    if (!file || !selectedProjectUuid) return;

    setImportStatus('正在解析并导入数据，请稍候...');
    setImportResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('project_uuid', selectedProjectUuid);

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
        // 刷新大盘
        fetchStats(selectedProjectUuid);
        fetchPipelines(selectedProjectUuid);
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

  // ─── 包含照片与模板的定制化 Excel 导出 ─────────────────
  const handleCustomExcelExport = async () => {
    if (!selectedProjectUuid || exportingExcel) return;
    setExportingExcel(true);
    try {
      const resp = await fetch(`/api/admin/projects/${selectedProjectUuid}/export-excel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_uuids: selectedPipelineUuids }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => ({}));
        alert(errJson.error || '导出数据失败');
        return;
      }

      const blob = await resp.blob();
      const contentDisposition = resp.headers.get('Content-Disposition') || '';
      let fileName = '';

      const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
      if (utf8Match && utf8Match[1]) {
        fileName = decodeURIComponent(utf8Match[1]);
      } else {
        const normalMatch = contentDisposition.match(/filename="([^"]+)"/i);
        if (normalMatch && normalMatch[1]) {
          fileName = decodeURIComponent(normalMatch[1]);
        }
      }

      if (!fileName) {
        const safeProjectName = selectedProject?.project_name || '项目';
        fileName = `${safeProjectName}_管道焊接过程质量管理基本信息.xlsx`;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('网络请求失败，无法导出数据: ' + err.message);
    } finally {
      setExportingExcel(false);
    }
  };

  // ─── 成员管理逻辑 ──────────────────────────────────────
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

  // ─── 项目过滤与排序计算 ──────────────────────────────────
  const filteredProjects = projectsList.filter(p => {
    const q = filterProjectQuery.trim().toLowerCase();
    return p.construction_no.toLowerCase().includes(q) || p.project_name.toLowerCase().includes(q);
  });

  const sortedProjects = [...filteredProjects].sort((a, b) => {
    if (sortProjectOrder === 'created_desc') {
      return new Date(b.created_at) - new Date(a.created_at);
    } else if (sortProjectOrder === 'created_asc') {
      return new Date(a.created_at) - new Date(b.created_at);
    } else if (sortProjectOrder === 'name') {
      return a.project_name.localeCompare(b.project_name, 'zh-CN');
    }
    return 0;
  });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-48px)] overflow-hidden font-sans bg-white">
      {/* 顶部 Tab 选项导航 (三栏化整合) */}
      <nav className="flex border-b border-[#e0e0e0] px-6 select-none bg-white">
        {[
          { id: 'dashboard', name: '管道焊口总览' },
          ...(currentUser?.role === 'admin' ? [
            { id: 'users', name: '成员管理' },
            { id: 'logs', name: '系统日志' },
            { id: 'settings', name: '系统设置' },
          ] : []),
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`h-12 px-6 text-[14px] font-normal tracking-[0.16px] border-b-2 transition-all duration-150 cursor-pointer outline-none bg-transparent
              ${activeTab === tab.id
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
      <div className="flex-1 overflow-y-auto bg-white min-h-0">

        {/* Panel: 管道焊口总览 */}
        {activeTab === 'dashboard' && (
          <div className="h-full flex flex-col min-h-0">

            {/* 项目未选中状态：展示全局项目面板 */}
            {!selectedProjectUuid ? (
              <div className="p-6 space-y-6 select-none">

                {/* 顶层面板标题 */}
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <div>
                    <h2 className="text-[22px] font-light text-[#161616]">项目控制台</h2>
                    <p className="text-[13px] text-[#525252] mt-1">
                      从项目开始管理，您可以在此编辑所有的工程项目和施工号，并设定管线/焊口号的自增生成前缀。
                    </p>
                  </div>
                  <button
                    onClick={() => setShowAddProjectModal(true)}
                    className="h-10 px-6 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] cursor-pointer rounded-none border-none outline-none font-medium flex items-center gap-1"
                  >
                    <span>+</span> 添加项目
                  </button>
                </div>

                {/* 搜索与过滤工具栏 */}
                <div className="p-4 bg-[#f4f4f4] border border-[#e0e0e0] flex justify-between items-center flex-wrap gap-4">
                  <div className="flex gap-4 items-center">
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#525252]">项目搜索:</span>
                      <input
                        type="text"
                        value={filterProjectQuery}
                        onChange={(e) => setFilterProjectQuery(e.target.value)}
                        placeholder="搜索施工号或项目名称..."
                        className="h-8 px-3 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none w-56 placeholder-[#8d8d8d]"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-[12px] text-[#525252]">创建排序:</span>
                      <select
                        value={sortProjectOrder}
                        onChange={(e) => setSortProjectOrder(e.target.value)}
                        className="h-8 px-2 bg-white border border-[#c6c6c6] text-[13px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                      >
                        <option value="created_desc">按创建时间 (最新优先)</option>
                        <option value="created_asc">按创建时间 (最早优先)</option>
                        <option value="name">按项目名称字母顺序</option>
                      </select>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      setFilterProjectQuery('');
                      setSortProjectOrder('created_desc');
                    }}
                    className="h-8 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] text-[#161616] cursor-pointer rounded-none font-medium"
                  >
                    重置过滤
                  </button>
                </div>

                {/* 项目列表格 */}
                <div className="border border-[#e0e0e0] overflow-x-auto bg-white">
                  <table className="w-full border-collapse text-[13px] text-left">
                    <thead>
                      <tr className="border-b border-[#c6c6c6] bg-[#f4f4f4] text-[#525252] font-semibold">
                        <th className="py-3 px-4 font-medium">施工号 (全局唯一)</th>
                        <th className="py-3 px-4 font-medium">项目名称</th>
                        <th className="py-3 px-4 font-medium">备注</th>
                        <th className="py-3 px-4 font-medium text-center">管线数</th>
                        <th className="py-3 px-4 font-medium text-center">焊口数</th>
                        <th className="py-3 px-4 font-medium text-center">完工情况</th>
                        <th className="py-3 px-4 font-medium">质量记录进度</th>
                        <th className="py-3 px-4 font-medium">创建时间</th>
                        <th className="py-3 px-4 font-medium text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e0e0e0] text-[#161616]">
                      {sortedProjects.length === 0 ? (
                        <tr>
                          <td colSpan="9" className="py-10 text-center text-[#8d8d8d]">
                            暂无匹配的项目。请点击右上角“新建项目”开始。
                          </td>
                        </tr>
                      ) : (
                        sortedProjects.map((p) => (
                          <tr key={p.uuid} className="hover:bg-[#f4f4f4] cursor-pointer transition-colors duration-100" onClick={() => handleSelectProject(p)}>
                            <td className="py-3.5 px-4 font-semibold text-[#0f62fe] hover:underline">
                              {p.construction_no}
                            </td>
                            <td className="py-3.5 px-4 font-medium text-[#161616]">
                              {p.project_name}
                            </td>
                            <td className="py-3.5 px-4 text-[#525252] truncate max-w-[200px]" title={p.remark}>
                              {p.remark || '-'}
                            </td>
                            <td className="py-3.5 px-4 text-center">{p.pipeline_count}</td>
                            <td className="py-3.5 px-4 text-center">{p.weld_count}</td>
                            <td className="py-3.5 px-4 text-center">
                              <span
                                className={`inline-block px-2 py-0.5 text-[11px] font-medium
                                  ${p.status === '已完工'
                                    ? 'bg-[#24a148]/10 text-[#24a148]'
                                    : 'bg-[#f1c21b]/10 text-[#7d5c00]'
                                  }
                                `}
                              >
                                {p.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-3">
                                <span className="text-[12px] font-semibold w-8">{p.quality_progress}%</span>
                                <div className="w-24 h-1.5 bg-[#e0e0e0] rounded-none overflow-hidden">
                                  <div
                                    className="bg-[#24a148] h-full"
                                    style={{ width: `${p.quality_progress}%` }}
                                  />
                                </div>
                              </div>
                            </td>
                            <td className="py-3.5 px-4 text-[#525252]">{p.created_at}</td>
                            <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={(e) => handleOpenEditProject(p, e)}
                                  className="px-3 py-1 bg-transparent hover:bg-[#0f62fe]/10 text-[#0f62fe] border border-[#0f62fe] text-[12px] cursor-pointer rounded-none font-medium"
                                >
                                  编辑
                                </button>
                                <button
                                  onClick={(e) => handleDeleteProject(p.uuid, e)}
                                  className="px-3 py-1 bg-transparent hover:bg-[#da1e28]/10 text-[#da1e28] border border-[#da1e28] text-[12px] cursor-pointer rounded-none font-medium"
                                >
                                  删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              /* 项目选中状态：折叠项目列表，渲染管线焊口控制台 */
              <div className="flex-1 flex flex-col min-h-0 bg-white">

                {/* 顶部面包屑导航 Breadcrumbs */}
                <div className="px-6 py-3 border-b border-[#e0e0e0] bg-[#f4f4f4] select-none text-[13px] flex items-center gap-2">
                  <button
                    onClick={handleBackToProjectConsole}
                    className="text-[#0f62fe] hover:underline cursor-pointer font-medium"
                  >
                    项目控制台
                  </button>
                  <span className="text-[#8d8d8d]">/</span>
                  <span className="text-[#161616] font-semibold flex items-center gap-1.5">
                    <span className="text-[#0f62fe] bg-[#edf5ff] px-2 py-0.5 font-semibold">{selectedProject.project_name}</span>
                    <span className="text-[#525252] font-normal">({selectedProject.construction_no})</span>
                  </span>
                </div>

                {/* 项目看板 StatsBar */}
                <div className="px-6 pt-4">
                  <StatsBar stats={stats} />
                </div>

                {/* 分栏工作区 */}
                <div className="flex-1 flex border-t border-[#e0e0e0] bg-white min-h-0">

                  {/* 左侧管线树导航 */}
                  <PipelineTree
                    projectUuid={selectedProjectUuid}
                    projectInfo={selectedProject}
                    pipelines={pipelines}
                    selectedPipelineUuid={selectedPipelineUuid}
                    onSelectPipelineUuid={(uuid, no) => {
                      setSelectedPipelineUuid(uuid);
                      setSelectedPipelineNo(no);
                    }}
                    onImportClick={() => {
                      setImportResult(null);
                      setImportStatus('');
                      setShowImportModal(true);
                    }}
                    onShowQR={handleOpenQRModal}
                    onRefresh={() => {
                      fetchStats(selectedProjectUuid);
                      fetchPipelines(selectedProjectUuid);
                    }}
                    onSelectionChange={(uuids) => setSelectedPipelineUuids(uuids)}
                    currentUser={currentUser}
                  />

                  {/* 右侧核心工作区 (直接渲染矩阵，移除云端归档浏览器页签以扩大版面) */}
                  <div className="flex-1 flex flex-col min-h-0 bg-white border-l border-[#e0e0e0]">

                    {/* 焊口过滤检索区 (统一高度为 h-16) */}
                    <div className="h-16 px-4 border-b border-[#e0e0e0] bg-[#f4f4f4] flex items-center justify-between select-none">
                      {selectedPipelineUuid ? (
                        <>
                          <div className="flex items-center gap-3 flex-wrap">
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#525252] font-medium">焊口筛选:</span>
                              <input
                                type="text"
                                value={filterWeld}
                                onChange={(e) => setFilterWeld(e.target.value)}
                                placeholder="关键字..."
                                className="h-8 px-2 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d] w-32"
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[12px] text-[#525252] font-medium">工序状态:</span>
                              <select
                                value={filterStatus}
                                onChange={(e) => setFilterStatus(e.target.value)}
                                className="h-8 px-2 bg-white border border-[#c6c6c6] text-[13px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer"
                              >
                                <option value="">全部</option>
                                <option value="completed">已完成</option>
                                <option value="pending">待录入</option>
                              </select>
                            </div>

                            {/* 最近上传时间范围筛选 (精确到时分秒，放在重置按钮前，使其受重置控制) */}
                            <div className="flex items-center gap-1.5 ml-1">
                              <span className="text-[12px] text-[#525252] font-medium">最近上传时间:</span>
                              <input
                                type="datetime-local"
                                step="1"
                                lang="zh-CN"
                                value={uploadStartDate}
                                onChange={(e) => { setUploadStartDate(e.target.value); setIs24hActive(false); }}
                                className="h-8 px-2 bg-white border border-[#c6c6c6] text-[12px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none font-sans"
                              />
                              <span className="text-[#8d8d8d]">-</span>
                              <input
                                type="datetime-local"
                                step="1"
                                lang="zh-CN"
                                value={uploadEndDate}
                                onChange={(e) => { setUploadEndDate(e.target.value); setIs24hActive(false); }}
                                className="h-8 px-2 bg-white border border-[#c6c6c6] text-[12px] text-[#161616] outline-none focus:border-[#0f62fe] rounded-none font-sans"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  if (is24hActive) {
                                    setIs24hActive(false);
                                    setUploadStartDate('');
                                    setUploadEndDate('');
                                  } else {
                                    setIs24hActive(true);
                                    const now = new Date();
                                    const ago24h = new Date(now.getTime() - 24 * 3600 * 1000);
                                    setUploadStartDate(formatDatetimeLocal(ago24h));
                                    setUploadEndDate(formatDatetimeLocal(now));
                                  }
                                }}
                                className={`h-8 px-2.5 text-[12px] border cursor-pointer font-medium rounded-none transition-colors ${is24hActive
                                  ? 'bg-[#0f62fe] text-white border-[#0f62fe]'
                                  : 'bg-white text-[#525252] border-[#c6c6c6] hover:bg-[#edf5ff] hover:text-[#0f62fe]'
                                  }`}
                              >
                                ⏱️ 最近 24 小时
                              </button>
                            </div>

                            <button
                              onClick={() => {
                                setFilterWeld('');
                                setFilterStatus('');
                                setUploadStartDate('');
                                setUploadEndDate('');
                                setIs24hActive(false);
                              }}
                              className="h-8 px-3 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] text-[#161616] cursor-pointer rounded-none font-medium"
                            >
                              重置
                            </button>
                          </div>

                          <button
                            onClick={() => {
                              fetchRecords(selectedPipelineUuid);
                              fetchStats(selectedProjectUuid);
                              if (selectedProjectUuid) fetchPipelines(selectedProjectUuid);
                            }}
                            className="h-8 px-3 border border-[#0f62fe] bg-white hover:bg-[#edf5ff] text-[#0f62fe] text-[12px] cursor-pointer rounded-none font-medium flex items-center gap-1 shrink-0 ml-2"
                          >
                            <span>🔄 刷新数据</span>
                          </button>
                        </>
                      ) : (
                        <div className="flex justify-between items-center w-full">
                          <span className="text-[12px] text-[#8d8d8d]">请从左侧选择管线号查看焊口进度</span>
                          <button
                            onClick={() => {
                              fetchProjects();
                              fetchStats(selectedProjectUuid);
                              if (selectedProjectUuid) fetchPipelines(selectedProjectUuid);
                            }}
                            className="h-8 px-3 border border-[#0f62fe] bg-white hover:bg-[#edf5ff] text-[#0f62fe] text-[12px] cursor-pointer rounded-none font-medium flex items-center gap-1"
                          >
                            <span>🔄 刷新大盘</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <WeldMatrix
                      records={weldRecords}
                      uploadStartDate={uploadStartDate}
                      uploadEndDate={uploadEndDate}
                      is24hActive={is24hActive}
                      onRefresh={() => {
                        fetchRecords(selectedPipelineUuid);
                        fetchStats(selectedProjectUuid);
                        if (selectedProjectUuid) fetchPipelines(selectedProjectUuid);
                      }}
                      currentUser={currentUser}
                      pipelineUuid={selectedPipelineUuid}
                      projectInfo={selectedProject}
                    />
                  </div>

                </div>

              </div>
            )}

          </div>
        )}

        {/* Panel: 成员管理 */}
        {activeTab === 'users' && (
          <div className="p-6 select-none">
            <div className="border border-[#e0e0e0] p-6 bg-white rounded-none">
              <div className="flex justify-between items-center mb-6">
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

              <div className="overflow-x-auto">
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
                        <td className="py-3 pr-4">{u.id}</td>
                        <td className="py-3 px-4 font-medium">{u.username}</td>
                        <td className="py-3 px-4">{u.display_name || '-'}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`inline-block px-2 py-0.5 text-[11px] rounded-none
                              ${u.role === 'admin'
                                ? 'bg-[#edf5ff] text-[#0f62fe]'
                                : u.role === 'project_admin'
                                  ? 'bg-[#f1c21b]/20 text-[#161616]'
                                  : 'bg-[#f4f4f4] text-[#525252]'
                              }
                            `}
                          >
                            {u.role === 'admin' ? '系统管理员' : u.role === 'project_admin' ? '项目管理员' : '施工员'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-[#525252]">{u.created_at}</td>
                        <td className="py-3 px-4 text-[#525252]">{u.last_login_at || '-'}</td>
                        <td className="py-3 pl-4 text-right">
                          <div className="flex justify-end gap-2">
                            <button
                              onClick={() => handleOpenEditModal(u)}
                              className="px-3 py-1 bg-transparent hover:bg-[#0f62fe]/10 text-[#0f62fe] border border-[#0f62fe] text-[12px] cursor-pointer rounded-none transition-colors duration-150 font-medium"
                            >
                              编辑
                            </button>
                            {u.username === 'admin' ? (
                              <span className="text-[#8d8d8d] text-[11px] leading-7">固有账户</span>
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

        {/* Panel: 系统日志 */}
        {activeTab === 'logs' && currentUser?.role === 'admin' && (
          <LogViewer />
        )}

        {/* Panel: 系统设置 */}
        {activeTab === 'settings' && settings && (
          <div className="p-6 max-w-6xl w-full select-none">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Left Column: 系统配置概览 */}
              <div className="border border-[#e0e0e0] p-6 bg-white rounded-none">
                <h2 className="text-[20px] font-light text-[#161616] mb-6">系统配置概览</h2>

                <div className="space-y-6">
                  <div className="border-b border-[#e0e0e0] pb-4">
                    <span className="text-[12px] text-[#525252] block mb-1">后端文件管理模式</span>
                    <span className="text-[14px] font-semibold text-[#0f62fe] bg-[#edf5ff] px-2.5 py-1 inline-block">
                      {settings.config.exportMode} (云端对象存储桶直传)
                    </span>
                    <p className="text-[12px] text-[#8d8d8d] mt-2">
                      照片数据由前端直接直传至 OSS 归档存储桶，完全跳过 Next.js 服务器中转，极速且免去服务器流量开销。
                    </p>
                  </div>

                  <div className="border-b border-[#e0e0e0] pb-4">
                    <span className="text-[12px] text-[#525252] block mb-1">云端 OSS 桶详情 (已脱敏)</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 text-[13px] bg-[#f4f4f4] p-4 border border-[#e0e0e0]">
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
                        <div key={ip} className="text-[14px] text-[#161616]">
                          • <a href={`http://${ip}:${settings.port}`} target="_blank" className="text-[#0f62fe] hover:underline font-semibold">http://{ip}:{settings.port}</a>
                        </div>
                      ))}
                    </div>
                    <p className="text-[12px] text-[#8d8d8d] mt-2">
                      请确保移动设备与宿主机连接到相同的 WiFi 局域网络环境，扫码定位功能方可正常交互。
                    </p>
                  </div>
                </div>
              </div>

              {/* Right Column: 系统配置与照片参数 */}
              <div className="border border-[#e0e0e0] p-6 bg-white rounded-none">
                <h2 className="text-[20px] font-light text-[#161616] mb-1">系统参数配置</h2>
                <p className="text-[12px] text-[#525252] mb-6">
                  配置服务器公网访问地址及前端照片压缩行为。修改后对所有新操作立即生效。
                </p>

                <div className="space-y-6">
                  {/* 服务器公网访问地址 */}
                  <div>
                    <label className="text-[13px] text-[#161616] font-medium block mb-2">服务器公网访问地址 (管线二维码链接前缀)</label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={serverPublicUrl}
                        onChange={(e) => setServerPublicUrl(e.target.value)}
                        placeholder="例如: http://47.99.125.9:4002"
                        className="flex-1 h-9 px-3 bg-white border border-[#c6c6c6] text-[13px] outline-none focus:border-[#0f62fe] rounded-none placeholder-[#8d8d8d]"
                      />
                      <button
                        type="button"
                        onClick={() => setServerPublicUrl(window.location.origin)}
                        className="h-9 px-4 border border-[#0f62fe] hover:bg-[#edf5ff] text-[#0f62fe] text-[12px] cursor-pointer rounded-none font-medium bg-white outline-none"
                      >
                        自动获取
                      </button>
                    </div>
                    <p className="text-[12px] text-[#8d8d8d] mt-2">
                      配置后，生成的二维码扫描链接将使用该公网地址。留空则自动降级使用上面展示的局域网 IP。
                    </p>
                  </div>

                  <hr className="border-t border-[#e0e0e0]" />

                  {/* 启停开关 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[13px] text-[#161616] font-medium w-24">启用压缩</label>
                    <button
                      type="button"
                      onClick={() => setCompressEnabled(!compressEnabled)}
                      className={`relative w-12 h-6 cursor-pointer transition-colors duration-200 border-none p-0 shrink-0 rounded-none ${compressEnabled ? 'bg-[#0f62fe]' : 'bg-[#8d8d8d]'
                        }`}
                    >
                      <span
                        className={`absolute top-[2px] left-0 w-5 h-5 bg-white transition-transform duration-200 ${compressEnabled ? 'translate-x-[26px]' : 'translate-x-[2px]'
                          }`}
                      />
                    </button>
                    <span className="text-[12px] text-[#525252]">
                      {compressEnabled ? '开启：拍照后自动压缩再上传' : '关闭：直接上传原始照片（文件较大）'}
                    </span>
                  </div>

                  {/* 分辨率预设 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[13px] text-[#161616] font-medium w-24">分辨率上限</label>
                    <select
                      value={`${compressMaxWidth}x${compressMaxHeight}`}
                      onChange={(e) => {
                        const [w, h] = e.target.value.split('x').map(Number);
                        setCompressMaxWidth(w);
                        setCompressMaxHeight(h);
                      }}
                      disabled={!compressEnabled}
                      className="h-9 px-3 bg-white border border-[#c6c6c6] text-[13px] outline-none focus:border-[#0f62fe] rounded-none cursor-pointer disabled:opacity-40"
                    >
                      <option value="1280x720">1280 × 720  (720P)</option>
                      <option value="1920x1080">1920 × 1080 (1080P)</option>
                      <option value="2560x1440">2560 × 1440 (2K)</option>
                      <option value="3840x2160">3840 × 2160 (4K)</option>
                    </select>
                    <span className="text-[12px] text-[#525252]">等比缩放，小图不放大</span>
                  </div>

                  {/* JPEG 质量 */}
                  <div className="flex items-center gap-3">
                    <label className="text-[13px] text-[#161616] font-medium w-24">JPEG 质量</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.05"
                      value={compressQuality}
                      onChange={(e) => setCompressQuality(parseFloat(e.target.value))}
                      disabled={!compressEnabled}
                      className="w-48 accent-[#0f62fe] disabled:opacity-40"
                    />
                    <span className="text-[14px] font-medium text-[#161616] w-12">
                      {Math.round(compressQuality * 100)}%
                    </span>
                  </div>

                  {/* 预估大小 */}
                  <div className="bg-[#f4f4f4] border border-[#e0e0e0] p-4 text-[12px] text-[#525252]">
                    <span className="font-medium text-[#161616]">预估效果：</span>
                    {compressEnabled ? (
                      <>
                        手机照片（约 5–10MB）压缩后约{' '}
                        <span className="font-medium text-[#0f62fe]">
                          {Math.round(compressMaxWidth * compressMaxHeight * compressQuality * 3 / 8 / 1024 * 0.15)}–{Math.round(compressMaxWidth * compressMaxHeight * compressQuality * 3 / 8 / 1024 * 0.35)}KB
                        </span>
                        ，分辨率 {compressMaxWidth}×{compressMaxHeight}，质量 {Math.round(compressQuality * 100)}%
                      </>
                    ) : (
                      <>原始照片直接上传，不做任何压缩处理。局域网弱网环境下上传较慢。</>
                    )}
                  </div>

                  {/* 保存按钮 */}
                  <div className="pt-2">
                    <button
                      onClick={handleSaveCompression}
                      disabled={savingCompression}
                      className="h-9 px-6 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[13px] cursor-pointer rounded-none border-none font-medium disabled:opacity-50"
                    >
                      {savingCompression ? '保存中...' : '保存系统配置'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── MODAL 1: 新建项目弹窗 ─────────────────────────── */}
      {showAddProjectModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <h3 className="text-[18px] font-light text-[#161616] mb-4">添加项目</h3>

            <form onSubmit={handleAddProject} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目施工号 (唯一)</label>
                <input
                  type="text"
                  required
                  value={newConstructionNo}
                  onChange={(e) => setNewConstructionNo(e.target.value)}
                  placeholder="如: SG-2024-001"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目名称</label>
                <input
                  type="text"
                  required
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="项目中文全称"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目备注</label>
                <input
                  type="text"
                  value={newRemark}
                  onChange={(e) => setNewRemark(e.target.value)}
                  placeholder="项目补充备注 (选填)"
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[12px] text-[#525252] mb-1">管线号生成前缀 (选填)</label>
                  <input
                    type="text"
                    value={newPipelinePrefix}
                    onChange={(e) => setNewPipelinePrefix(e.target.value)}
                    placeholder="如: PL (生成 PL-001)"
                    className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[12px] text-[#525252] mb-1">焊口号生成前缀 (选填)</label>
                  <input
                    type="text"
                    value={newWeldPrefix}
                    onChange={(e) => setNewWeldPrefix(e.target.value)}
                    placeholder="如: W (生成 W-01)"
                    className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0] mt-6">
                <button
                  type="button"
                  onClick={() => setShowAddProjectModal(false)}
                  className="h-9 px-4 border border-[#c6c6c6] bg-white hover:bg-[#e8e8e8] text-[12px] cursor-pointer rounded-none"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="h-9 px-5 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] cursor-pointer rounded-none border-none outline-none font-medium"
                >
                  保存创建
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL 2: 编辑项目弹窗 ─────────────────────────── */}
      {showEditProjectModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[480px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <h3 className="text-[18px] font-light text-[#161616] mb-4">编辑项目设置</h3>

            <form onSubmit={handleEditProject} className="space-y-4">
              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目施工号 (唯一)</label>
                <input
                  type="text"
                  required
                  value={editConstructionNo}
                  onChange={(e) => setEditConstructionNo(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目名称</label>
                <input
                  type="text"
                  required
                  value={editProjectName}
                  onChange={(e) => setEditProjectName(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目备注</label>
                <input
                  type="text"
                  value={editRemark}
                  onChange={(e) => setEditRemark(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col">
                  <label className="text-[12px] text-[#525252] mb-1">管线号前缀</label>
                  <input
                    type="text"
                    value={editPipelinePrefix}
                    onChange={(e) => setEditPipelinePrefix(e.target.value)}
                    className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                  />
                </div>
                <div className="flex flex-col">
                  <label className="text-[12px] text-[#525252] mb-1">焊口号前缀</label>
                  <input
                    type="text"
                    value={editWeldPrefix}
                    onChange={(e) => setEditWeldPrefix(e.target.value)}
                    className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[13px] outline-none rounded-none"
                  />
                </div>
              </div>

              <div className="flex flex-col">
                <label className="text-[12px] text-[#525252] mb-1">项目完工状态</label>
                <select
                  value={editProjectStatus}
                  onChange={(e) => setEditProjectStatus(e.target.value)}
                  className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] text-[13px] outline-none rounded-none cursor-pointer"
                >
                  <option value="进行中">进行中</option>
                  <option value="已完工">已完工</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-[#e0e0e0] mt-6">
                <button
                  type="button"
                  onClick={() => setShowEditProjectModal(false)}
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

      {/* ─── MODAL 3: Excel 导入弹窗 ───────────────────────── */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/40 z-[99999] flex items-center justify-center p-4">
          <div className="w-full max-w-[600px] bg-white border border-[#e0e0e0] p-6 rounded-none select-none">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-[#e0e0e0]">
              <h3 className="text-[18px] font-light text-[#161616]">导入管线焊口数据</h3>
              <button
                onClick={() => setShowImportModal(false)}
                className="bg-transparent border-none text-[#525252] hover:text-[#161616] text-[18px] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-[13px] text-[#525252] mb-4">
              上传 `.xlsx` 格式的焊口清单，批量新增管线和焊口到当前项目。<br />
              数据表必须包含：<strong className="text-[#161616]">管线号、焊口号</strong>两列（表头列名支持包含关键字模糊匹配）。<br />
              已存在的「管线号+焊口号」组合会被自动跳过，不会覆盖。
            </p>

            <div
              onClick={() => document.getElementById('modalExcelInput').click()}
              className="border-2 border-dashed border-[#c6c6c6] hover:border-[#0f62fe] bg-[#f4f4f4] py-8 text-center cursor-pointer transition-colors duration-150"
            >
              <div className="text-[28px] mb-1">📎</div>
              <div className="text-[18px] text-[#161616] font-medium">点击选择或拖入 Excel 文件</div>
            </div>
            <input
              type="file"
              id="modalExcelInput"
              accept=".xlsx,.xls"
              onChange={handleImportExcel}
              className="hidden"
            />

            {importStatus && (
              <div className="mt-3 p-2 bg-[#edf5ff] text-[#0f62fe] text-[12px]">
                {importStatus}
              </div>
            )}

            {importResult && (
              <div className="mt-4">
                {importResult.success ? (
                  <div className="p-3 bg-[#24a148]/10 border border-[#24a148] text-[#24a148] text-[13px]">
                    <strong>🎉 导入成功！</strong>
                    <span className="ml-2">行数: {importResult.total} | 新增: {importResult.inserted} | 跳过: {importResult.skipped}</span>
                  </div>
                ) : (
                  <div className="p-3 bg-[#da1e28]/10 border border-[#da1e28] text-[#da1e28] text-[13px]">
                    <strong>⚠️ 导入失败：</strong> {importResult.error}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-[#e0e0e0] mt-6">
              <div className="flex gap-3">
                <button
                  onClick={() => window.open('/api/admin/export-template', '_blank')}
                  className="h-8 px-4 bg-[#f4f4f4] hover:bg-[#e0e0e0] text-[#161616] text-[12px] cursor-pointer border border-[#c6c6c6] rounded-none"
                >
                  📥 下载导入模板
                </button>
                <button
                  type="button"
                  onClick={handleCustomExcelExport}
                  disabled={!selectedProjectUuid || exportingExcel}
                  className="h-8 px-4 bg-[#0f62fe] hover:bg-[#0353e9] text-white text-[12px] cursor-pointer border-none outline-none rounded-none font-medium disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <span>📊</span>
                  <span>
                    {exportingExcel
                      ? '正在生成包含照片的 Excel...'
                      : selectedPipelineUuids.length > 0
                      ? `导出已选 ${selectedPipelineUuids.length} 条管线数据`
                      : '导出项目完整数据'}
                  </span>
                </button>
              </div>
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

      {/* ─── MODAL 4: 单个管线二维码查看弹窗 ───────────────── */}
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


            <div className="w-64 h-64 mx-auto bg-white border border-[#e0e0e0] flex items-center justify-center p-2">
              {qrLoading ? (
                <div className="text-[12px] text-[#8d8d8d]">正在生成二维码...</div>
              ) : qrData.qr ? (
                <img src={qrData.qr} alt={qrPipelineNo} className="w-full h-full object-contain" />
              ) : (
                <div className="text-[12px] text-[#da1e28]">生成失败</div>
              )}
            </div>

            <div className="font-semibold text-[15px] text-[#161616] mb-4 text-center space-y-1">
              {(qrData.project_name || selectedProject?.project_name) && (
                <div className="text-[15px] text-[#525252]">
                  {qrData.project_name || selectedProject?.project_name}
                  <br />
                  ({qrData.construction_no || selectedProject?.construction_no})
                </div>
              )}
              <div>管线号: {qrPipelineNo}</div>
            </div>

            {!qrLoading && qrData.url && (
              <div className="mt-3 text-[11px] text-[#8d8d8d] break-all text-left">
                URL: {qrData.url}
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

      {/* ─── MODAL 5: 添加成员弹窗 ───────────────────────── */}
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
                  <option value="project_admin">项目管理员</option>
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

      {/* ─── MODAL 6: 编辑成员弹窗 ───────────────────────── */}
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
                  <option value="project_admin">项目管理员</option>
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
