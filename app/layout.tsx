import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const jetBrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'HMIF Center',
  description: 'Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA',
};

/**
 * Root layout.
 *
 * Skrip anti-flash tema dipasang pada T-014. Font dimuat di layout agar Next.js
 * dapat mengoptimalkan berkasnya tanpa request eksternal dari browser.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="id"
      data-theme="light"
      className={`${inter.variable} ${jetBrainsMono.variable}`}
    >
      <body className={inter.className}>{children}</body>
    </html>
  );
}
