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

const themeScript = `
(function () {
  var theme = 'system';

  try {
    var storedTheme = localStorage.getItem('theme');
    if (storedTheme === 'light' || storedTheme === 'dark' || storedTheme === 'system') {
      theme = storedTheme;
    }
  } catch (_) {}

  var prefersDark = typeof matchMedia === 'function' &&
    matchMedia('(prefers-color-scheme: dark)').matches;
  var resolvedTheme = theme === 'dark' || (theme === 'system' && prefersDark)
    ? 'dark'
    : 'light';

  document.documentElement.setAttribute('data-theme', resolvedTheme);
})();
`;

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
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
