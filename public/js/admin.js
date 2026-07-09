// ========== 认证检查 ==========
(async function() {
  try {
    const resp = await fetch('/api/auth/check');
    const data = await resp.json();
    if (!data.logged_in) { window.location.href = '/login.html'; return; }
    if (data.user.role !== 'admin') { window.location.href = '/upload.html'; return; }
    document.getElementById('userName').textContent = data.user.display_name || data.user.username;
    document.getElementById('userRole').textContent = data.user.role === 'admin' ? '管理员' : '施工人员';
  } catch { window.location.href = '/login.html'; }
})();

function logout() {
  fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/login.html');
}

// ========== Tab切换 ==========
function switchTab(name) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  if (name === 'overview') { loadStats(); loadRecords(); }
  if (name === 'qrcode') loadQRCodes();
  if (name === 'export') loadExportTree();
  if (name === 'users') loadUsers();
  if (name === 'settings') loadSettings();
}

// ========== 记录总览 ==========
async function loadStats() {
  try {
    const resp = await fetch('/api/admin/stats');
    const data = await resp.json();
    if (data.success) {
      document.getElementById('statTotal').textContent = data.stats.total;
      document.getElementById('statDone').textContent = data.stats.completed;
      document.getElementById('statPending').textContent = data.stats.pending;
    }
  } catch {}
}

async function loadRecords() {
  const pipeline = document.getElementById('filterPipeline').value;
  const weld = document.getElementById('filterWeld').value;
  const status = document.getElementById('filterStatus').value;
  const params = new URLSearchParams();
  if (pipeline) params.set('pipeline_no', pipeline);
  if (weld) params.set('weld_no', weld);
  if (status) params.set('status', status);

  try {
    const resp = await fetch('/api/admin/records?' + params);
    const data = await resp.json();
    if (data.success) {
      const tbody = document.getElementById('recordsBody');
      if (data.records.length === 0) {
        tbody.innerHTML = '<tr><td colspan="11" style="text-align:center;color:var(--text-secondary);padding:24px;">暂无数据</td></tr>';
        return;
      }
      tbody.innerHTML = data.records.map(r => `
        <tr>
          <td>${r.seq_no || ''}</td>
          <td>${r.project_name || ''}</td>
          <td>${r.construction_no || ''}</td>
          <td>${r.project_no || ''}</td>
          <td>${r.pipeline_no || ''}</td>
          <td>${r.weld_no || ''}</td>
          <td>${photoStatus(r.photo_zudui)}</td>
          <td>${photoStatus(r.photo_dadi)}</td>
          <td>${photoStatus(r.photo_gaimian)}</td>
          <td>${r.uploaded_by || '-'}</td>
          <td>${r.uploaded_at || '-'}</td>
        </tr>
      `).join('');
    }
  } catch {}
}

function photoStatus(field) {
  return field
    ? '<span class="text-done"><span class="status-dot done"></span>已上传</span>'
    : '<span class="text-pending"><span class="status-dot pending"></span>未上传</span>';
}

function clearFilter() {
  document.getElementById('filterPipeline').value = '';
  document.getElementById('filterWeld').value = '';
  document.getElementById('filterStatus').value = '';
  loadRecords();
}

// ========== 数据导入 ==========
async function importExcel(input) {
  const file = input.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('file', file);

  const resultDiv = document.getElementById('importResult');
  resultDiv.innerHTML = '<p style="color:var(--text-secondary);">正在导入...</p>';

  try {
    const resp = await fetch('/api/admin/import', { method: 'POST', body: formData });
    const data = await resp.json();
    if (data.success) {
      resultDiv.innerHTML = `
        <div class="alert" style="background:#f6ffed;border:1px solid #b7eb8f;color:#389e0d;padding:12px;border-radius:8px;">
          导入成功！共 ${data.total} 行，新增 ${data.inserted} 条，跳过 ${data.skipped} 条（重复）
        </div>`;
      loadStats();
      loadRecords();
    } else {
      resultDiv.innerHTML = `<div class="alert alert-error">${data.error}</div>`;
    }
  } catch (e) {
    resultDiv.innerHTML = `<div class="alert alert-error">导入失败：${e.message}</div>`;
  }
  input.value = '';
}

// ========== 二维码管理 ==========
async function loadQRCodes() {
  const container = document.getElementById('qrList');
  container.innerHTML = '<p style="color:var(--text-secondary);">加载中...</p>';
  try {
    const resp = await fetch('/api/admin/qrcodes');
    const data = await resp.json();
    if (data.success) {
      if (data.items.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);">暂无管线数据，请先导入Excel</p>';
        return;
      }
      container.innerHTML = data.items.map(item => `
        <div class="qr-item">
          <img src="${item.qr}" alt="${item.pipeline_no}">
          <div class="label">管线号: ${item.pipeline_no}</div>
          <div style="font-size:11px;color:var(--text-secondary);margin-top:4px;">${item.url}</div>
          <button class="btn btn-outline btn-sm" style="margin-top:8px;" onclick="downloadQR('${item.pipeline_no}', '${item.qr}')">下载</button>
        </div>
      `).join('');
    }
  } catch (e) {
    container.innerHTML = `<p style="color:var(--danger);">加载失败：${e.message}</p>`;
  }
}

function downloadQR(name, dataUrl) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'QR_' + name + '.png';
  a.click();
}

// ========== 导出浏览 ==========
async function loadExportTree() {
  const container = document.getElementById('exportTree');
  container.innerHTML = '<p style="color:var(--text-secondary);">加载中...</p>';
  try {
    const resp = await fetch('/api/admin/export-folder');
    const data = await resp.json();
    if (data.success) {
      if (!data.tree || data.tree.length === 0) {
        container.innerHTML = '<p style="color:var(--text-secondary);">暂无导出文件</p>';
        return;
      }
      container.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;">根目录: ' + data.root + '</div>' + renderTree(data.tree);
    }
  } catch (e) {
    container.innerHTML = `<p style="color:var(--danger);">加载失败：${e.message}</p>`;
  }
}

function renderTree(items) {
  let html = '<ul style="list-style:none;padding-left:0;">';
  for (const item of items) {
    if (item.type === 'dir') {
      html += `<li style="padding:4px 0;">📁 ${item.name}`;
      if (item.children && item.children.length > 0) {
        html += renderTree(item.children);
      }
      html += '</li>';
    } else {
      const sizeKB = (item.size / 1024).toFixed(0);
      html += `<li style="padding:4px 0;">📷 <a href="/api/admin/download?path=${encodeURIComponent(item.path)}" target="_blank" style="color:var(--primary);text-decoration:none;">${item.name}</a> <span style="color:var(--text-secondary);font-size:11px;">(${sizeKB}KB)</span></li>`;
    }
  }
  html += '</ul>';
  return html;
}

// ========== 用户管理 ==========
async function loadUsers() {
  try {
    const resp = await fetch('/api/admin/users');
    const data = await resp.json();
    if (data.success) {
      const tbody = document.getElementById('usersBody');
      tbody.innerHTML = data.users.map(u => `
        <tr>
          <td>${u.id}</td>
          <td>${u.username}</td>
          <td>${u.display_name || ''}</td>
          <td>${u.role === 'admin' ? '管理员' : '施工人员'}</td>
          <td>${u.created_at || ''}</td>
          <td>${u.username === 'admin' ? '-' : `<button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id})">删除</button>`}</td>
        </tr>
      `).join('');
    }
  } catch {}
}

function showAddUserModal() {
  document.getElementById('newUsername').value = '';
  document.getElementById('newPassword').value = '';
  document.getElementById('newDisplayName').value = '';
  document.getElementById('newRole').value = 'worker';
  document.getElementById('addUserModal').classList.add('show');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('show');
}

async function addUser() {
  const username = document.getElementById('newUsername').value.trim();
  const password = document.getElementById('newPassword').value;
  const display_name = document.getElementById('newDisplayName').value.trim();
  const role = document.getElementById('newRole').value;

  if (!username || !password) return alert('用户名和密码不能为空');

  try {
    const resp = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password, role, display_name })
    });
    const data = await resp.json();
    if (data.success) {
      closeModal('addUserModal');
      loadUsers();
    } else {
      alert(data.error || '添加失败');
    }
  } catch (e) { alert('错误: ' + e.message); }
}

async function deleteUser(id) {
  if (!confirm('确定删除该用户？')) return;
  try {
    const resp = await fetch('/api/admin/users/' + id, { method: 'DELETE' });
    const data = await resp.json();
    if (data.success) { loadUsers(); }
    else { alert(data.error || '删除失败'); }
  } catch (e) { alert('错误: ' + e.message); }
}

// ========== 系统设置 ==========
async function loadSettings() {
  try {
    const resp = await fetch('/api/admin/settings');
    const data = await resp.json();
    if (data.success) {
      document.getElementById('exportRootInput').value = data.config.exportRoot || '';
      const addrs = data.serverIPs.map(ip => `http://${ip}:${data.port}`).join('  |  ');
      document.getElementById('serverAddr').textContent = addrs || `http://localhost:${data.port}`;
    }
  } catch {}
}

async function saveSettings() {
  const exportRoot = document.getElementById('exportRootInput').value;
  try {
    const resp = await fetch('/api/admin/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ exportRoot })
    });
    const data = await resp.json();
    if (data.success) {
      alert('设置已保存');
    } else {
      alert(data.error || '保存失败');
    }
  } catch (e) { alert('错误: ' + e.message); }
}

// ========== 目录浏览器 ==========
let selectedDirPath = '';

async function showDirBrowser() {
  selectedDirPath = document.getElementById('exportRootInput').value || '';
  document.getElementById('dirBrowserModal').classList.add('show');
  await browseDirs('root');
}

async function browseDirs(targetPath) {
  const breadcrumbEl = document.getElementById('dirBreadcrumb');
  const itemsEl = document.getElementById('dirItems');
  breadcrumbEl.textContent = '加载中...';
  itemsEl.innerHTML = '';

  try {
    const params = new URLSearchParams();
    if (targetPath && targetPath !== 'root') params.set('path', targetPath);
    const resp = await fetch('/api/admin/browse-dirs?' + params);
    const data = await resp.json();
    if (data.success) {
      if (targetPath !== 'root') selectedDirPath = data.current;
      breadcrumbEl.textContent = data.current === 'root' ? '我的电脑' : data.current;
      let html = '';
      if (data.parent) {
        html += `<div class="dir-item" onclick="browseDirs('${encodeURIComponent(data.parent)}')">📁 .. (上级目录)</div>`;
      }
      for (const item of data.items) {
        const isSelected = selectedDirPath === item.path;
        html += `<div class="dir-item ${isSelected ? 'current' : ''}" onclick="selectDir('${encodeURIComponent(item.path)}')">
          📁 ${item.name}
          <span style="margin-left:auto;font-size:11px;color:var(--text-secondary);">${isSelected ? '已选' : '选择'}</span>
        </div>`;
      }
      itemsEl.innerHTML = html || '<div style="padding:16px;color:var(--text-secondary);text-align:center;">没有子目录</div>';
    } else {
      breadcrumbEl.textContent = '错误';
      itemsEl.innerHTML = `<div style="padding:16px;color:var(--danger);">${data.error}</div>`;
    }
  } catch (e) {
    breadcrumbEl.textContent = '错误';
    itemsEl.innerHTML = `<div style="padding:16px;color:var(--danger);">${e.message}</div>`;
  }
}

function selectDir(encodedPath) {
  selectedDirPath = decodeURIComponent(encodedPath);
  browseDirs(encodedPath);
}

function confirmDir() {
  document.getElementById('exportRootInput').value = selectedDirPath;
  closeModal('dirBrowserModal');
}

// 初始化
loadStats();
loadRecords();
