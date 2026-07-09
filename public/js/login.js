async function doLogin() {
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const alertEl = document.getElementById('alert');

  if (!username || !password) {
    alertEl.textContent = '请输入用户名和密码';
    alertEl.style.display = 'block';
    return;
  }

  try {
    const resp = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();

    if (data.success) {
      if (data.user.role === 'admin') {
        window.location.href = '/admin.html';
      } else {
        window.location.href = '/upload.html';
      }
    } else {
      alertEl.textContent = data.error || '登录失败';
      alertEl.style.display = 'block';
    }
  } catch (e) {
    alertEl.textContent = '网络错误，请检查服务是否运行';
    alertEl.style.display = 'block';
  }
}

document.getElementById('password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

// 检查是否已登录
(async function checkAuth() {
  try {
    const resp = await fetch('/api/auth/check');
    const data = await resp.json();
    if (data.logged_in) {
      if (data.user.role === 'admin') window.location.href = '/admin.html';
      else window.location.href = '/upload.html';
    }
  } catch {}
})();
