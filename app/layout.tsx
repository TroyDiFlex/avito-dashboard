import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ПИК · Еженедельный аудит Авито',
  description: 'Недельная динамика рекламы, маржи, репутации и объявлений',
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru" className="dark">
      <body>{children}</body>
    </html>
  );
}
