import { redirect } from 'next/navigation';

/**
 * 首页 — 重定向至登录页
 *
 * 与 V1.0 行为一致（原 Express: app.get('/', (req, res) => res.redirect('/login.html'))）
 */
export default function Home() {
  redirect('/login');
}
