import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'ПИК · Аналитика Авито',
  description: 'Статистика подразделений и история объявлений',
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
