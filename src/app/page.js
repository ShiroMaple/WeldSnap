import { redirect } from 'next/navigation';

/**
 * 首页 — 重定向至登录页
 * * 根路径重定向到当前 V2 登录页面
 */
export default function Home() {
  redirect('/login');
}
