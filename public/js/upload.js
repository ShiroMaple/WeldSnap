let currentUser = null;
let selectedPipeline = null;
let selectedWeld = null;
let uploadedPhotos = { zudui: null, dadi: null, gaimian: null };

// ========== 认证检查 ==========
(async function init() {
  try {
    const resp = await fetch('/api/auth/check');
    const data = await resp.json();
    if (!data.logged_in) { window.location.href = '/login.html'; return; }
    currentUser = data.user;
    if (data.user.role === 'admin') {
      // 管理员也可以访问上传页
    }
    checkUrlForPipeline();
  } catch { window.location.href = '/login.html'; }
})();

function logout() {
  fetch('/api/auth/logout', { method: 'POST' }).then(() => window.location.href = '/login.html');
}

// ========== 检查URL中的管线号参数 ==========
function checkUrlForPipeline() {
  const params = new URLSearchParams(window.location.search);
  const pipeline = params.get('pipeline');
  if (pipeline) {
    selectPipeline(pipeline);
  } else {
    showManualSearch();
  }
}

function showManualSearch() {
  document.getElementById('searchBox').style.display = 'block';
  document.getElementById('pipelineDisplay').style.display = 'none';
  setupSearch();
}

// ========== 管线号搜索 ==========
function setupSearch() {
  const input = document.getElementById('pipelineSearch');
  const results = document.getElementById('searchResults');
  let timer = null;

  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (!q) { results.classList.remove('show'); return; }
    timer = setTimeout(async () => {
      try {
        const resp = await fetch('/api/welds/search?q=' + encodeURIComponent(q));
        const data = await resp.json();
        if (data.success && data.results.length > 0) {
          results.innerHTML = data.results.map(r => `
            <div class="item" onclick="selectPipeline('${r.pipeline_no}')">
              <b>${r.pipeline_no}</b>
              <span style="color:var(--text-secondary);font-size:12px;margin-left:8px;">${r.project_name || ''} ${r.construction_no || ''} ${r.project_no || ''}</span>
            </div>
          `).join('');
          results.classList.add('show');
        } else {
          results.innerHTML = '<div class="item" style="color:var(--text-secondary);">无匹配结果</div>';
          results.classList.add('show');
        }
      } catch {}
    }, 300);
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.search-box')) results.classList.remove('show');
  });
}

async function selectPipeline(pipelineNo) {
  selectedPipeline = pipelineNo;
  // 验证管线号存在并加载焊口号
  try {
    const resp = await fetch('/api/welds/by-pipeline/' + encodeURIComponent(pipelineNo));
    const data = await resp.json();
    if (!data.success || data.welds.length === 0) {
      alert('管线号 ' + pipelineNo + ' 不存在或无焊口记录');
      showManualSearch();
      return;
    }
    document.getElementById('searchBox').style.display = 'none';
    document.getElementById('pipelineDisplay').textContent = '管线号: ' + pipelineNo;
    document.getElementById('pipelineDisplay').style.display = 'block';
    document.getElementById('weldSection').style.display = 'block';
    document.getElementById('photoSection').style.display = 'none';

    // 填充焊口号下拉
    const select = document.getElementById('weldSelect');
    select.innerHTML = '<option value="">请选择焊口号</option>' + data.welds.map(w => {
      const done = w.photo_zudui && w.photo_dadi && w.photo_gaimian;
      return `<option value="${w.weld_no}" ${done ? 'disabled' : ''}>${w.weld_no}${done ? ' (已完成)' : ''}</option>`;
    }).join('');

    // 清空选择
    document.getElementById('searchResults').classList.remove('show');
    document.getElementById('pipelineSearch').value = '';
  } catch (e) {
    alert('加载失败: ' + e.message);
  }
}

// ========== 焊口号选择 ==========
function onWeldSelected() {
  const weldNo = document.getElementById('weldSelect').value;
  if (!weldNo) {
    document.getElementById('photoSection').style.display = 'none';
    return;
  }
  selectedWeld = weldNo;
  document.getElementById('photoSection').style.display = 'block';
  uploadedPhotos = { zudui: null, dadi: null, gaimian: null };
  updatePhotoSlots();
  updateSubmitBtn();
  document.getElementById('uploadForm').scrollIntoView({ behavior: 'smooth' });
}

// ========== 照片上传 ==========
function triggerCapture(type) {
  document.getElementById('input-' + type).click();
}

async function uploadPhoto(type, input) {
  const file = input.files[0];
  if (!file) return;

  // 显示上传中
  const status = document.getElementById('status-' + type);
  const body = document.getElementById('body-' + type);
  const btn = document.getElementById('btn-' + type);
  status.textContent = '上传中...';
  status.className = 'status';
  status.style.color = 'var(--warning)';
  btn.disabled = true;

  const formData = new FormData();
  formData.append('pipeline_no', selectedPipeline);
  formData.append('weld_no', selectedWeld);
  formData.append('photo_type', type);
  formData.append('file', file);

  // 管理员可覆盖
  const isAdmin = currentUser.role === 'admin';
  formData.append('overwrite', isAdmin.toString());

  try {
    const resp = await fetch('/api/upload/photo', { method: 'POST', body: formData });
    const data = await resp.json();

    if (data.success) {
      uploadedPhotos[type] = data.path;
      status.textContent = '已上传';
      status.className = 'status text-done';
      // 显示预览
      body.innerHTML = `<img src="/api/photo/preview?path=${encodeURIComponent(data.path)}" alt="${data.fileName}">`;
      document.getElementById('slot-' + type).classList.add('uploaded');
      btn.textContent = '重新拍照';
    } else {
      status.textContent = '失败: ' + (data.error || '未知错误');
      status.className = 'status';
      status.style.color = 'var(--danger)';
      body.innerHTML = '<div class="placeholder"><div class="icon">📷</div><p>上传失败，请重试</p></div>';
    }
  } catch (e) {
    status.textContent = '网络错误';
    status.className = 'status';
    status.style.color = 'var(--danger)';
  }

  btn.disabled = false;
  input.value = '';
  updateSubmitBtn();
}

function updatePhotoSlots() {
  for (const type of ['zudui', 'dadi', 'gaimian']) {
    const status = document.getElementById('status-' + type);
    const body = document.getElementById('body-' + type);
    const btn = document.getElementById('btn-' + type);
    const slot = document.getElementById('slot-' + type);

    if (uploadedPhotos[type]) {
      status.textContent = '已上传';
      status.className = 'status text-done';
      body.innerHTML = `<img src="/api/photo/preview?path=${encodeURIComponent(uploadedPhotos[type])}" alt="">`;
      slot.classList.add('uploaded');
      btn.textContent = '重新拍照';
    } else {
      status.textContent = '未上传';
      status.className = 'status text-pending';
      body.innerHTML = '<div class="placeholder"><div class="icon">📷</div><p>点击拍照</p></div>';
      slot.classList.remove('uploaded');
      btn.textContent = '拍照上传';
    }
  }
}

function updateSubmitBtn() {
  const allUploaded = uploadedPhotos.zudui && uploadedPhotos.dadi && uploadedPhotos.gaimian;
  document.getElementById('submitBtn').disabled = !allUploaded;
}

function submitAll() {
  document.getElementById('uploadForm').style.display = 'none';
  document.getElementById('successPage').style.display = 'block';
  document.getElementById('successDetail').textContent =
    `管线号 ${selectedPipeline} - 焊口号 ${selectedWeld} 的3张工序照片已成功保存`;
}

function resetForm() {
  selectedWeld = null;
  uploadedPhotos = { zudui: null, dadi: null, gaimian: null };
  document.getElementById('weldSelect').value = '';
  document.getElementById('photoSection').style.display = 'none';
  document.getElementById('uploadForm').style.display = 'block';
  document.getElementById('successPage').style.display = 'none';
  updatePhotoSlots();
  updateSubmitBtn();

  // 如果有管线号参数，保留
  const params = new URLSearchParams(window.location.search);
  if (!params.get('pipeline')) {
    selectedPipeline = null;
    document.getElementById('pipelineDisplay').style.display = 'none';
    document.getElementById('weldSection').style.display = 'none';
    document.getElementById('searchBox').style.display = 'block';
    document.getElementById('pipelineSearch').value = '';
  } else {
    // 刷新焊口号列表（排除刚完成的）
    selectPipeline(selectedPipeline);
  }
}
