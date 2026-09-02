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

      // Rahasia server tidak boleh disentuh dari kode yang bisa ikut ke browser.
      'no-restricted-properties': [
        'error',
        {
          object: 'process',
          property: 'env',
          message:
            'Baca environment variable lewat modul konfigurasi server, bukan langsung di komponen. Rahasia server dilarang menyentuh sisi klien (AGENT_RULES K-08).',
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
