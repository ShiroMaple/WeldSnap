const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const QRCode = require('qrcode');
const XLSX = require('xlsx');
const crypto = require('crypto');

const db = require('./db');

// ---------- 配置 ----------
const CONFIG_PATH = path.join(__dirname, 'config.json');
function loadConfig() {
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { return { exportRoot: '', port: 3000 }; }
}
function saveConfig(cfg) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
let config = loadConfig();

// ---------- 辅助函数 ----------
function sanitizeFilename(name) {
  return String(name || '').replace(/[\/\\:*?"<>|]/g, '_').trim();
}

const PHOTO_TYPE_MAP = {
  zudui:   '组对',
  dadi:    '打底',
  gaimian: '盖面',
};

// 检测局域网IP
function getLocalIPs() {
  const ifaces = os.networkInterfaces();
  const ips = [];
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address);
      }
    }
  }
  return ips;
}

// ---------- Express ----------
const app = express();
const PORT = config.port || 3000;

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: 'weld-photo-secret-key-2024',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 12 * 60 * 60 * 1000 }
}));
// 首页重定向到登录页
app.get('/', (req, res) => res.redirect('/login.html'));

app.use(express.static(path.join(__dirname, 'public')));

// 文件上传配置
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 } // 30MB
});

// ---------- 认证中间件 ----------
function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '请先登录' });
  next();
}
function requireAdmin(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: '请先登录' });
  if (req.session.user.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' });
  next();
}

// ---------- 认证路由 ----------
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.json({ success: false, error: '请输入用户名和密码' });
  const user = db.verifyUser(username, password);
  if (!user) return res.json({ success: false, error: '用户名或密码错误' });
  req.session.user = user;
  res.json({ success: true, user });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  if (req.session.user) {
    res.json({ logged_in: true, user: req.session.user });
  } else {
    res.json({ logged_in: false });
  }
});

// ---------- 管理员路由 ----------
// 导入Excel
app.post('/api/admin/import', requireAdmin, upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.json({ success: false, error: '请选择文件' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (rows.length === 0) return res.json({ success: false, error: 'Excel文件为空' });

    // 列名匹配
    const colMap = {};
    const possibleNames = {
      seq_no: ['序号', '序', 'seq', 'no'],
      project_name: ['项目名称', '项目'],
      construction_no: ['施工号', '施工'],
      project_no: ['项目号'],
      pipeline_no: ['管线号', '管线'],
      weld_no: ['焊口号', '焊口', '焊缝号', '焊缝'],
    };

    const headers = Object.keys(rows[0]);
    for (const [field, names] of Object.entries(possibleNames)) {
      for (const h of headers) {
        const lower = h.toLowerCase().trim();
        if (names.some(n => lower === n.toLowerCase() || lower.includes(n.toLowerCase()))) {
          colMap[field] = h;
          break;
        }
      }
    }

    // 检查必需字段
    if (!colMap.pipeline_no || !colMap.weld_no) {
      return res.json({ success: false, error: 'Excel缺少必需列：管线号或焊口号' });
    }

    const records = rows.map(r => ({
      seq_no: colMap.seq_no ? r[colMap.seq_no] : '',
      project_name: colMap.project_name ? r[colMap.project_name] : '',
      construction_no: colMap.construction_no ? r[colMap.construction_no] : '',
      project_no: colMap.project_no ? r[colMap.project_no] : '',
      pipeline_no: r[colMap.pipeline_no],
      weld_no: r[colMap.weld_no],
    })).filter(r => r.pipeline_no && r.weld_no);

    const result = db.importWeldRecords(records);
    res.json({ success: true, ...result, mapped: colMap });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 记录总览
app.get('/api/admin/records', requireAdmin, (req, res) => {
  const filters = {
    pipeline_no: req.query.pipeline_no || '',
    weld_no: req.query.weld_no || '',
    status: req.query.status || '',
  };
  const records = db.getAllRecords(filters);
  res.json({ success: true, records });
});

// 所有管线号
app.get('/api/admin/pipelines', requireAdmin, (req, res) => {
  const pipelines = db.getAllPipelines();
  res.json({ success: true, pipelines });
});

// 生成单个二维码
app.get('/api/admin/qrcode/:pipeline_no', requireAdmin, async (req, res) => {
  try {
    const pipelineNo = decodeURIComponent(req.params.pipeline_no);
    const ips = getLocalIPs();
    const ip = ips[0] || 'localhost';
    const url = `http://${ip}:${PORT}/upload.html?pipeline=${encodeURIComponent(pipelineNo)}`;
    const qrDataUrl = await QRCode.toDataURL(url, { width: 300, margin: 1 });
    res.json({ success: true, url, qr: qrDataUrl });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 所有二维码（打印页数据）
app.get('/api/admin/qrcodes', requireAdmin, async (req, res) => {
  try {
    const pipelines = db.getAllPipelines();
    const ips = getLocalIPs();
    const ip = ips[0] || 'localhost';
    const items = [];
    for (const p of pipelines) {
      const url = `http://${ip}:${PORT}/upload.html?pipeline=${encodeURIComponent(p.pipeline_no)}`;
      const qr = await QRCode.toDataURL(url, { width: 250, margin: 1 });
      items.push({ pipeline_no: p.pipeline_no, url, qr });
    }
    res.json({ success: true, items, serverIP: ip, port: PORT });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 导出文件夹浏览
app.get('/api/admin/export-folder', requireAdmin, (req, res) => {
  try {
    const exportRoot = config.exportRoot || path.join(__dirname, 'exports');
    function buildTree(dirPath, depth = 0) {
      if (depth > 4) return [];
      const items = fs.readdirSync(dirPath, { withFileTypes: true });
      return items.map(item => {
        const fullPath = path.join(dirPath, item.name);
        if (item.isDirectory()) {
          return { name: item.name, type: 'dir', path: fullPath, children: buildTree(fullPath, depth + 1) };
        } else {
          const stat = fs.statSync(fullPath);
          return { name: item.name, type: 'file', path: fullPath, size: stat.size, mtime: stat.mtime };
        }
      });
    }
    const tree = fs.existsSync(exportRoot) ? buildTree(exportRoot) : [];
    res.json({ success: true, tree, root: exportRoot });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 下载文件
app.get('/api/admin/download', requireAdmin, (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath || !fs.existsSync(filePath)) return res.status(404).send('文件不存在');
    res.download(filePath);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// 修改设置
app.post('/api/admin/settings', requireAdmin, (req, res) => {
  try {
    const { exportRoot } = req.body;
    if (exportRoot !== undefined) {
      // 验证路径
      if (exportRoot && !fs.existsSync(exportRoot)) {
        try { fs.mkdirSync(exportRoot, { recursive: true }); }
        catch { return res.json({ success: false, error: '无法创建目录: ' + exportRoot }); }
      }
      config.exportRoot = exportRoot || '';
      saveConfig(config);
    }
    res.json({ success: true, config });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 获取设置
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ success: true, config, serverIPs: getLocalIPs(), port: PORT });
});

// 浏览本地目录
app.get('/api/admin/browse-dirs', requireAdmin, (req, res) => {
  try {
    let targetPath = req.query.path;
    if (!targetPath || targetPath === 'root') {
      // Windows: 列出盘符
      const drives = [];
      for (let code = 65; code <= 90; code++) {
        const drive = String.fromCharCode(code) + ':\\';
        try { fs.accessSync(drive); drives.push(drive); } catch {}
      }
      return res.json({ success: true, current: 'root', items: drives.map(d => ({ name: d, type: 'dir', path: d })) });
    }
    targetPath = decodeURIComponent(targetPath);
    if (!fs.existsSync(targetPath)) return res.json({ success: false, error: '路径不存在' });
    const stat = fs.statSync(targetPath);
    if (!stat.isDirectory()) return res.json({ success: false, error: '不是目录' });
    const items = fs.readdirSync(targetPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => ({ name: d.name, type: 'dir', path: path.join(targetPath, d.name) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh'));
    res.json({ success: true, current: targetPath, parent: path.dirname(targetPath), items });
  } catch (e) {
    res.json({ success: false, error: e.message });
  }
});

// 用户管理
app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({ success: true, users: db.listUsers() });
});

app.post('/api/admin/users', requireAdmin, (req, res) => {
  const { username, password, role, display_name } = req.body;
  if (!username || !password) return res.json({ success: false, error: '用户名和密码不能为空' });
  if (!['admin', 'worker'].includes(role)) return res.json({ success: false, error: '无效的角色' });
  const result = db.createUser(username, password, role, display_name || username);
  res.json(result);
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const result = db.deleteUser(parseInt(req.params.id));
  res.json(result);
});

// 统计
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  res.json({ success: true, stats: db.getStats() });
});

// ---------- 施工人员路由 ----------
// 按管线号获取焊口号列表
app.get('/api/welds/by-pipeline/:pipeline_no', requireAuth, (req, res) => {
  const pipelineNo = decodeURIComponent(req.params.pipeline_no);
  const welds = db.getWeldsByPipelineNo(pipelineNo);
  res.json({ success: true, welds });
});

// 搜索管线号
app.get('/api/welds/search', requireAuth, (req, res) => {
  const q = req.query.q || '';
  if (!q) return res.json({ success: true, results: [] });
  const results = db.searchPipelines(q);
  res.json({ success: true, results });
});

// 上传照片
app.post('/api/upload/photo', requireAuth, upload.single('file'), (req, res) => {
  try {
    const { pipeline_no, weld_no, photo_type } = req.body;
    const overwrite = req.body.overwrite === 'true';

    if (!pipeline_no || !weld_no || !photo_type) {
      return res.json({ success: false, error: '缺少参数' });
    }
    if (!PHOTO_TYPE_MAP[photo_type]) {
      return res.json({ success: false, error: '无效的照片类型' });
    }
    if (!req.file) {
      return res.json({ success: false, error: '请选择照片' });
    }

    const weld = db.getWeldByPipelineAndWeldNo(pipeline_no, weld_no);
    if (!weld) return res.json({ success: false, error: '焊口记录不存在' });

    // 检查是否已上传
    const fieldMap = { zudui: 'photo_zudui', dadi: 'photo_dadi', gaimian: 'photo_gaimian' };
    const field = fieldMap[photo_type];
    if (weld[field] && !overwrite) {
      return res.json({ success: false, error: '该照片已上传，如需覆盖请联系管理员' });
    }
    if (overwrite && req.session.user.role !== 'admin') {
      return res.json({ success: false, error: '覆盖照片需要管理员权限' });
    }

    // 构建文件夹路径
    const exportRoot = config.exportRoot || path.join(__dirname, 'exports');
    const folderName = `${sanitizeFilename(weld.project_name)}_${sanitizeFilename(weld.construction_no)}_${sanitizeFilename(weld.project_no)}`;
    const dirPath = path.join(exportRoot, folderName, sanitizeFilename(pipeline_no), sanitizeFilename(weld_no));
    fs.mkdirSync(dirPath, { recursive: true });

    // 构建文件名
    const typeName = PHOTO_TYPE_MAP[photo_type];
    const fileName = `${sanitizeFilename(pipeline_no)}-${sanitizeFilename(weld_no)}-${typeName}.jpg`;
    const filePath = path.join(dirPath, fileName);

    // 删除旧文件（覆盖时）
    if (weld[field] && overwrite) {
      // 尝试删除旧文件（可能路径不同，忽略错误）
      try {
        const oldPath = path.join(exportRoot, weld[field]);
        if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      } catch {}
    }

    // 保存文件
    fs.writeFileSync(filePath, req.file.buffer);

    // 更新数据库（存储相对路径）
    const relPath = path.relative(exportRoot, filePath);
    db.updatePhotoPath(weld.id, field, relPath, req.session.user.display_name || req.session.user.username);

    res.json({ success: true, fileName, path: relPath });
  } catch (e) {
    console.error('上传错误:', e);
    res.json({ success: false, error: e.message });
  }
});

// 获取照片预览
app.get('/api/photo/preview', requireAuth, (req, res) => {
  try {
    const relPath = req.query.path;
    if (!relPath) return res.status(400).send('缺少path参数');
    const exportRoot = config.exportRoot || path.join(__dirname, 'exports');
    const filePath = path.join(exportRoot, relPath);
    // 安全检查：确保路径在导出根目录下
    if (!filePath.startsWith(exportRoot)) return res.status(403).send('无权访问');
    if (!fs.existsSync(filePath)) return res.status(404).send('文件不存在');
    res.sendFile(filePath);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

// ---------- 启动服务器 ----------
app.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIPs();
  console.log('\n========================================');
  console.log('  管道焊口工序照片录入系统 已启动');
  console.log('========================================');
  console.log(`  本机访问:  http://localhost:${PORT}`);
  ips.forEach(ip => console.log(`  局域网:    http://${ip}:${PORT}`));
  console.log('----------------------------------------');
  console.log('  默认管理员: admin / admin123');
  console.log(`  导出目录:   ${config.exportRoot || '(未设置，使用默认exports/)'}`);
  console.log('========================================\n');
});
