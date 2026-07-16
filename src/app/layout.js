import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/**
 * IBM Plex Sans — 主界面字体
 * 权重：300 (Display Light) / 400 (Body Regular) / 600 (UI Semibold)
 */
const plexSans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  variable: '--font-plex-sans',
  display: 'swap',
});

/**
 * IBM Plex Mono — 技术标签、代码、路径显示
 */
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400'],
  variable: '--font-plex-mono',
  display: 'swap',
});

export const metadata = {
  title: '管道焊口工序照片录入系统',
  description:
    'WeldSnap — 石化管道焊口工序照片结构化录入与归档系统。支持扫码定位、手机拍照、自动命名归档。',
};

export default function RootLayout({ children }) {
  return (
    <html lang="zh-CN" className={`${plexSans.variable} ${plexMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
