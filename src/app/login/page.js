'use client';

/**
 * 登录页面 (Client Component)
 *
 * 严格基于 IBM Carbon 视觉令牌设计：
 *   - 0px 绝对直角按钮与输入框 (rounded-none)
 *   - 无阴影 flat 卡片布局，深度依靠 Gray 10 背景实现层级分流
 *   - 【简易登录】作为视觉与操作重心，高频使用，支持设备指纹免密安全自注册与重名检测
 *   - 【管理登录】作为次要位置，使用 secondary 灰色按钮风格，置于下方
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // ─── 简易登录设备指纹与姓名状态 ───────────────────────────
  const [mounted, setMounted] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [savedName, setSavedName] = useState('');
  const [tempName, setTempName] = useState('');
  const [showNameInput, setShowNameInput] = useState(true);

  useEffect(() => {
    setMounted(true);
    let storedId = localStorage.getItem('weldsnap_device_id');
    const storedName = localStorage.getItem('weldsnap_display_name');

    if (!storedId) {
      // 首次登录，生成全局唯一的浏览器/设备特征 ID
      storedId = 'dev_' + Math.random().toString(36).substring(2, 11) + '_' + Date.now().toString(36);
      localStorage.setItem('weldsnap_device_id', storedId);
    }

    setDeviceId(storedId);

    if (storedName) {
      setSavedName(storedName);
      setShowNameInput(false);
    } else {
      setShowNameInput(true);
    }
  }, []);

  // ─── 简易登录逻辑 ───────────────────────────────────────
  const handleEasyLogin = async (e) => {
    e.preventDefault();
    const nameToSubmit = showNameInput ? tempName : savedName;

    if (showNameInput && !nameToSubmit.trim()) {
      setError('请输入您的姓名');
      return;
    }

    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const resp = await fetch('/api/auth/anonymous', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deviceId,
          displayName: showNameInput ? nameToSubmit.trim() : undefined, // 仅在输入新名字时向后端发送以更新或注册
        }),
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        // 后端可能自动为重名加上了后缀（如：张师傅_0001），此处存入最终生成的姓名
        localStorage.setItem('weldsnap_display_name', data.user.display_name);
        setSavedName(data.user.display_name);
        setShowNameInput(false);

        // ✅ 登录成功，{姓名}
        setSuccessMsg(`✅登录成功，${data.user.display_name}`);

        setTimeout(() => {
          router.push('/upload');
        }, 1200);
      } else {
        setError(data.error || '登录失败，请重试');
        setLoading(false);
      }
    } catch (err) {
      setError('网络连接错误，请检查网络');
      setLoading(false);
    }
  };

  // ─── 管理员/正常密码登录逻辑 ──────────────────────────────
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setError('');
    setSuccessMsg('');
    setLoading(true);

    try {
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await resp.json();

      if (resp.ok && data.success) {
        setSuccessMsg(`✅登录成功，${data.user.display_name || data.user.username}`);

        setTimeout(() => {
          if (data.user.role === 'admin') {
            router.push('/admin');
          } else {
            router.push('/upload');
          }
        }, 1200);
      } else {
        setError(data.error || '用户名或密码错误');
        setLoading(false);
      }
    } catch (err) {
      setError('网络连接错误，请检查网络');
      setLoading(false);
    }
  };

  if (!mounted) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[#f4f4f4] font-mono text-[#525252] text-[14px]">
        [WeldSnap] Loading login portal...
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#f4f4f4] p-4 font-sans select-none">
      <div className="w-full max-w-[400px] bg-white border border-[#e0e0e0] p-10 rounded-none shadow-none">

        {/* 顶部 Logo 与系统名称 */}
        <header className="mb-6">
          <h1 className="text-[28px] font-light leading-tight tracking-normal text-[#161616]">
            管道焊口工序质量记录
          </h1>
          <p className="text-[14px] font-normal leading-normal tracking-[0.16px] text-[#525252] mt-2">
            WeldSnap
          </p>
        </header>

        {/* 提示信息区域 */}
        {error && (
          <div className="mb-6 p-3 bg-[#fff2f0] border border-[#ffccc7] text-[#da1e28] text-[13px] rounded-none font-medium">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="mb-6 p-3 bg-[#f6ffed] border border-[#b7eb8f] text-[#24a148] text-[13px] rounded-none font-medium">
            {successMsg}
          </div>
        )}

        {/* 核心视觉重点：简易登录区 */}
        <div className="bg-white">
          <form onSubmit={handleEasyLogin} className="flex flex-col">
            {showNameInput ? (
              <div className="flex flex-col mb-4">
                <label className="text-[12px] font-normal tracking-[0.32px] text-[#525252] mb-2 leading-relaxed">
                  检测到您首次使用该浏览器登录，请输入您的姓名：
                </label>
                <input
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  placeholder="请输入您的姓名"
                  disabled={loading}
                  className="h-11 px-4 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[#161616] text-[14px] outline-none transition-colors duration-200 rounded-none placeholder-[#8d8d8d] disabled:opacity-50"
                />
              </div>
            ) : (
              <div className="flex flex-col mb-4">
                <span className="text-[12px] text-[#6f6f6f] block">当前设备账号：</span>
                <div className="text-[18px] font-medium text-[#0f62fe] mt-1 font-mono tracking-wide">
                  {savedName}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-24 bg-[#0f62fe] hover:bg-[#0353e9] active:bg-[#002d9c] text-white text-[22px] font-semibold tracking-[0.16px] transition-colors duration-200 rounded-none border-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#0f62fe] cursor-pointer disabled:bg-[#8d8d8d] disabled:cursor-not-allowed flex items-center justify-between px-6 mt-2"
            >
              <span>{loading ? '登录中...' : '简 易 登 录'}</span>
              <span className="text-[28px]">→</span>
            </button>
          </form>
        </div>

        {/* 次要分界线 */}
        <div className="my-6 border-t border-[#e0e0e0]" />

        {/* 次要视觉区：管理登录区 */}
        <div className="bg-white">
          <span className="text-[12px] font-semibold text-[#525252] block mb-3">管理登录通道</span>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <div className="flex flex-col">
              <label className="text-[11px] font-normal tracking-[0.32px] text-[#6f6f6f] mb-1">
                管理员账户
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入管理员用户名"
                disabled={loading}
                autoComplete="username"
                className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[#161616] text-[13px] outline-none transition-colors duration-200 rounded-none placeholder-[#8d8d8d] disabled:opacity-50"
              />
            </div>

            <div className="flex flex-col">
              <label className="text-[11px] font-normal tracking-[0.32px] text-[#6f6f6f] mb-1">
                密码
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="请输入密码"
                disabled={loading}
                autoComplete="current-password"
                className="h-9 px-3 bg-[#f4f4f4] border-t-0 border-x-0 border-b-2 border-transparent focus:border-[#0f62fe] focus:bg-[#e8e8e8] text-[#161616] text-[13px] outline-none transition-colors duration-200 rounded-none placeholder-[#8d8d8d] disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full h-10 bg-[#393939] hover:bg-[#4c4c4c] active:bg-[#6f6f6f] text-white text-[13px] font-normal tracking-[0.16px] transition-colors duration-200 rounded-none border-none outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#393939] cursor-pointer disabled:bg-[#8d8d8d] disabled:cursor-not-allowed flex items-center justify-between px-3 mt-4"
            >
              <span>管 理 登 录</span>
            </button>
          </form>
        </div>

      </div>
    </main>
  );
}
