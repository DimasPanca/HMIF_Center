/**
 * Placeholder beranda.
 *
 * Halaman sebenarnya dibangun pada T-075 (Master Gantt) dan T-077 (dashboard
 * kontekstual per role), setelah shell aplikasi T-051 tersedia.
 */
export default function Beranda() {
  return (
    <main style={{ padding: 32, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700 }}>HMIF Center</h1>
      <p style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>
        Sistem E-Administrasi Himpunan Mahasiswa Informatika FT UNTIRTA.
      </p>
      <p style={{ marginTop: 8, color: 'var(--text-tertiary)' }}>
        Scaffold T-009 selesai. Beranda dibangun pada T-075 dan T-077.
      </p>
    </main>
  );
}
