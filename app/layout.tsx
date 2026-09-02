import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'HMIF Center',
  description: 'Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA',
};

/**
 * Root layout.
 *
 * Font (Inter + JetBrains Mono, DESIGN_SYSTEM 3.1) dan skrip anti-flash tema
 * dipasang pada T-013 dan T-014. Font Geist yang disisipkan otomatis oleh
 * shadcn init sengaja dihapus: DESIGN_SYSTEM tidak memakainya, dan membiarkannya
 * berarti memuat font yang langsung diganti dua task kemudian.
 */
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id" data-theme="light">
      <body>{children}</body>
    </html>
  );
}
