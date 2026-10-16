import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({ baseDirectory: __dirname });

/**
 * Konfigurasi ESLint — AGENT_RULES §3 Konvensi Kode.
 *
 * Larangan `SUPABASE_SECRET_KEY` di berkas "use client" (K-08) TIDAK ada di sini:
 * flat config bekerja per pola nama berkas, sedangkan "use client" adalah direktif
 * di dalam isi berkas. Penegakannya ada di `scripts/check-client-secrets.ts`,
 * yang ikut dijalankan oleh `npm run verify`.
 */
const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),

  {
    ignores: [
      'node_modules/**',
      '.next/**',
      '.next-*/**',
      'out/**',
      'build/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'next-env.d.ts',
      'tmp/**',
    ],
  },

  // ---- Aturan untuk kode aplikasi ----
  {
    files: ['app/**/*.{ts,tsx}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}', 'hooks/**/*.{ts,tsx}'],
    rules: {
      // K: console.log tertinggal mengotori log produksi dan kadang membocorkan data.
      'no-console': ['error', { allow: ['error', 'warn'] }],

      // K-10: import memakai alias @/, bukan menaiki dua level atau lebih.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['../../*', '../../../*', '../../../../*'],
              message:
                'Naik lebih dari satu level dilarang (AGENT_RULES K-10). Pakai alias "@/".',
            },
          ],
        },
      ],

      // K-13: animasi hanya 120 ms dan 180 ms; nilai lain harus disengaja.
      'no-restricted-syntax': [
        'warn',
        {
          selector: 'Literal[value=/^\\d{3,}ms$/]',
          message:
            'Durasi animasi hanya 120 ms dan 180 ms (DESIGN_SYSTEM §6.1). Nilai lain perlu alasan tertulis.',
        },
      ],
    },
  },

  /**
   * Komponen UI tidak pernah punya alasan sah membaca environment variable.
   *
   * Larangan ini SENGAJA tidak diberlakukan pada `app/**` dan `lib/**`:
   * Route Handler, Server Action, dan modul infrastruktur seperti
   * `lib/db/connection.ts` justru merupakan tempat yang benar untuk membacanya.
   * Melarangnya di sana berarti aturan melarang hal yang ia sendiri tunjuk
   * sebagai solusi, dan setiap modul server terpaksa memakai eslint-disable —
   * yang justru melemahkan aturan sampai tak berarti.
   *
   * Penjaga sebenarnya untuk kebocoran rahasia adalah `npm run check:secrets`,
   * yang membaca direktif "use client" dan karena itu tahu persis berkas mana
   * yang benar-benar ikut ke bundle browser (AGENT_RULES K-08).
   */
  {
    files: ['components/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Komponen tidak membaca environment variable. Terima nilainya sebagai prop dari Server Component, atau baca lewat modul di lib/ (AGENT_RULES K-08).',
        },
      ],
    },
  },

  // ---- Skrip CLI: console memang keluarannya ----
  {
    files: ['scripts/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  // ---- Test: boleh longgar ----
  {
    files: ['**/__tests__/**/*.ts', '**/*.test.ts', 'e2e/**/*.ts'],
    rules: {
      'no-console': 'off',
      'no-restricted-properties': 'off',
    },
  },
];

export default eslintConfig;
