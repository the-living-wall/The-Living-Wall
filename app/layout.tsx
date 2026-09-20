import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: '小莹 · 互动生命',
  description: '慢慢靠近小莹，看看它会如何回应。一个由碎片、波纹与核心组成，会呼吸、随陪伴成长的异次元生命体互动原型。',
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
