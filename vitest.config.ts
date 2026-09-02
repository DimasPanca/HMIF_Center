import { defineConfig } from 'vitest/config';
import path from 'node:path';

/**
 * Konfigurasi unit test.
 *
 * Environment default `node` karena mayoritas test di project ini menguji
 * fungsi murni: parsing jumlah RAB, geometri Gantt, format tanggal dan rupiah,
 * kalkulasi LPJ. Berkas yang butuh DOM menyatakannya sendiri lewat komentar
 * `// @vitest-environment jsdom` di baris pertama.
 *
 * Test SQL TIDAK dijalankan di sini — ia punya runner sendiri (`npm run db:test`)
 * karena butuh transaksi yang selalu di-rollback terhadap database sungguhan.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
    exclude: ['node_modules/**', '.next/**', 'e2e/**', 'supabase/**'],
    testTimeout: 15_000,
    reporters: 'default',
  },
  resolve: {
    alias: { '@': path.resolve(__dirname) },
  },
});
