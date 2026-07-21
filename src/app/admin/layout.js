'use client';

/**
 * 管理员后台基础布局 (Client Component)
 *
 * 职责：
 *   1. 身份认证守卫：首屏及每次渲染时请求 /api/auth/check。如果未登录或非管理员（系统管理员/项目管理员），拦截跳转回 /login。
 *   2. 提供顶层 IBM Carbon 经典的 Masthead 导航（深色背景 #161616，高度 48px）。
 *   3. 全局退出登录状态维护。
 */

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLayout({ children }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null);
  const router = useRouter();

  useEffect(() => {
    async function checkAuth() {
      try {
        const resp = await fetch('/api/auth/check');
        const data = await resp.json();
        if (!data.logged_in || (data.user.role !== 'admin' && data.user.role !== 'project_admin')) {
          router.push('/login');
        } else {
          setUser(data.user);
          setLoading(false);
        }
      } catch (err) {
        router.push('/login');
      }
    }
    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (err) {
      alert('注销失败，请重试');
    }
  };

  if (loading) {
    // 渲染骨架屏或极简加载界面，防止闪烁
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f4f4f4] text-[#525252] text-[14px]">
        [WeldSnap] Loading workspace...
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* 顶层 Masthead 导航栏 (IBM Carbon style: #161616, 48px height) */}
      <header className="h-12 bg-[#161616] text-[#ffffff] px-6 flex items-center justify-between select-none">
        <div className="flex items-center gap-4">
          <span className="font-semibold text-[16px] tracking-[0.16px]">建安管线焊口工序质量记录 WeldSnap</span>
          <span className="h-4 w-[1px] bg-[#393939]" />
          <span className="text-[14px] text-[#c6c6c6] font-light">管理控制台</span>
        </div>

        <div className="flex items-center gap-6 text-[13px]">
          <div className="flex items-center gap-2">
            <span className="text-[#c6c6c6]">当前用户:</span>
            <span className="text-white font-medium">{user.display_name || user.username}</span>
            <span className="px-2 py-0.5 bg-[#393939] text-[#edf5ff] text-[11px] rounded-none">
              {user.role === 'admin' ? '系统管理员' : user.role === 'project_admin' ? '项目管理员' : '管理员'}
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="text-[#c6c6c6] hover:text-white transition-colors duration-200 bg-transparent border-none cursor-pointer outline-none text-[13px]"
          >
            退出
          </button>
        </div>
      </header>

      {/* 主工作区 */}
      <div className="flex-1 flex flex-col">
        {children}
      </div>
    </div>
  );
}
