/**
 * lane — alat koordinasi dua agent yang bekerja bersamaan di repositori ini.
 *
 *   npx tsx scripts/lane.ts status <data|ui>
 *   npx tsx scripts/lane.ts claim  <data|ui> <T-0XX>
 *   npx tsx scripts/lane.ts done   <data|ui> <T-0XX>
 *   npx tsx scripts/lane.ts block  <data|ui> <T-0XX> "alasan konkret"
 *   npx tsx scripts/lane.ts guard  <data|ui>
 *   npx tsx scripts/lane.ts sync
 *
 * Yang membuat dua agent tidak bentrok bukan dokumentasi, melainkan tiga hal:
 *
 *   1. KEPEMILIKAN FILE  — tiap lane hanya boleh menulis pohon file miliknya.
 *      `guard` memeriksanya secara mekanis dari git status, bukan dari niat baik.
 *   2. STATE TERPISAH    — tiap lane menulis berkas state sendiri. docs/ai/tasks.json
 *      dibekukan selama kerja paralel dan hanya disatukan lewat `sync`.
 *   3. NOMOR ADR TERPISAH — tiap lane punya rentang nomor sendiri, jadi tidak
 *      mungkin dua agent membuat ADR-020 bersamaan.
 *
 * Sumber: docs/ai/PARALLEL_PROTOCOL.md
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

type Lane = 'data' | 'ui';
type Status = 'TODO' | 'READY' | 'IN_PROGRESS' | 'BLOCKED' | 'DONE';

interface Tugas {
  id: string;
  fase: number;
  judul: string;
  depends_on: string[];
  status: Status;
  butuh_manusia?: boolean;
  completed_at: string | null;
  blocked_reason?: string;
}

interface StateLane {
  lane: Lane;
  nama: string;
  branch: string;
  adr_range: [number, number];
  milik: string[];
  tasks: Tugas[];
}

const AKAR = process.cwd();
const TASKS = path.join(AKAR, 'docs', 'ai', 'tasks.json');
const DIR_LANE = path.join(AKAR, 'docs', 'ai', 'lanes');
const fileState = (l: Lane) => path.join(DIR_LANE, `state-${l}.json`);

// ---------------------------------------------------------------------------
// Kepemilikan file — SATU-SATUNYA sumber kebenaran. Protokol hanya menjelaskan.
// ---------------------------------------------------------------------------

const MILIK: Record<Lane, string[]> = {
  data: [
    'supabase/**',
    'prisma/**',
    'lib/db/**',
    'lib/storage/**',
    'lib/images/**',
    'lib/auth/**',
    'lib/rab/**',
    'lib/surat/**',
    'lib/documents/**',
    'lib/lpj/**',
    'lib/backup/**',
    'lib/realtime/**',

    // Ditambahkan setelah audit kepemilikan pada sync S3. Seluruhnya mengikuti
    // pola yang sudah ada: namespace lib/<domain>/** yang berisi service,
    // schema, dan aturan bisnis dimiliki lane data; lane ui memakainya lewat
    // impor, tidak menyuntingnya. Sebelum ini, dua puluh berkas di bawah tidak
    // dimiliki siapa pun dan guard menolaknya dengan "milik TIDAK TERDAFTAR" —
    // baru ketahuan setelah agent selesai menulis kodenya.
    'lib/proker/**',
    'lib/kepanitiaan/**',
    'lib/tor/**',
    'lib/proposal/**',
    'lib/cron/**',
    'lib/deadline.ts',
    'lib/import/**',
    'lib/security/**',
    'lib/README.md',

    // middleware.ts menegakkan autentikasi untuk seluruh rute (dashboard);
    // ia sepasang dengan lib/auth/** dan bukan berkas tampilan.
    'middleware.ts',

    // vercel.json mendaftarkan Vercel Cron (ADR-009) dan sepasang dengan
    // next.config.ts yang sudah dimiliki lane ini.
    'vercel.json',
    'scripts/**',
    'templates/**',
    'e2e/**',
    'public/**',
    'package.json',
    'package-lock.json',
    'eslint.config.mjs',
    '.prettierrc',
    '.prettierignore',
    'vitest.config.ts',
    'playwright.config.ts',
    'next.config.ts',
    'docs/ai/lanes/state-data.json',
    'docs/ai/DB_TEST_MATRIX.md',
    'docs/ai/RLS_TEST_MATRIX.md',
    'docs/ai/PROVISIONING_CHECKLIST.md',
    'docs/ai/ENV_SETUP.md',

    // Serah-terima antar-sesi. Memuat keputusan yang lahir di percakapan dan
    // tidak punya rumah lain — pembagian task yang belum tuntas, urutan yang
    // diminta pemilik produk, jebakan lingkungan yang sudah pernah memakan
    // waktu. Ditulis lane ini karena isinya tentang pekerjaan lane ini.
    'docs/ai/HANDOFF-DATA.md',

    // Laporan yang isinya tentang kode lane ini.
    'docs/ai/TEMPLATE_MAPPING.md',
    'docs/ai/SECURITY_AUDIT.md',

    // Kontrak antar-lane untuk T-045: tanda tangan fungsi yang dipanggil
    // route handler milik lane ui. Ditulis lane data karena lane inilah yang
    // memiliki fungsinya; lane ui membacanya, tidak menyuntingnya.
    'docs/ai/AUTH_CONTRACT.md',

    // Rencana gelombang ketiga: pembelahan ke-26 task, nomor migrasi berikutnya,
    // dan konvensi kontrak antar-lane. Ditulis lane ini karena lane ini yang
    // memegang scripts/lane.ts tempat pembagiannya ditegakkan.
    'docs/ai/RENCANA-GELOMBANG-3.md',

    // Kontrak antar-lane untuk T-047: tanda tangan lib/auth/invitation.ts yang
    // dipanggil route handler T-047-UI.
    'docs/ai/UNDANGAN_CONTRACT.md',

    // Kontrak antar-lane untuk T-065, mengikuti pola AUTH_CONTRACT.md persis:
    // lane data memiliki lib/proker/**, lane ui memanggilnya dari
    // app/api/proker/**. Tanpa berkas ini pembelahan T-065 hanya hidup di
    // percakapan, dan lane ui harus membaca kode untuk mengetahui bentuk
    // argumen yang diterimanya.
    'docs/ai/PROKER_CONTRACT.md',

    // README menjelaskan cara menyiapkan dan menjalankan proyek — env,
    // migrasi, skrip — seluruhnya wilayah lane ini. Dikeluarkan dari BEKU
    // karena T-116 memang menuntut perubahannya.
    'README.md',

    // Dua ADR di rentang 001-019 yang dilepas dari BEKU, keduanya karena ada
    // task atau keputusan yang menuntut statusnya diperbarui:
    //   ADR-010  strategi PDF, diimplementasikan T-062
    //   ADR-019  koordinat RAB AKTUAL, diputuskan pemilik produk pada sync S3
    'docs/adr/ADR-010*.md',
    'docs/adr/ADR-019*.md',

    // Rentang ADR lane data: 020-039
    'docs/adr/ADR-02*.md',
    'docs/adr/ADR-03*.md',
  ],
  ui: [
    'app/**',
    'components/**',
    'lib/utils/**',
    'lib/theme.ts',
    'lib/gantt/**',
    'lib/shortcuts.ts',
    'hooks/**',
    'tailwind.config.ts',
    'postcss.config.mjs',
    'components.json',
    'docs/ai/lanes/state-ui.json',

    // Laporan dan panduan yang isinya tentang apa yang dilihat pengguna.
    // Penugasan fase 8-9 ini bersifat sementara: protokol menyebut rencana
    // lane disusun ulang setelah S3, dan pembagian di bawah hanya menutup
    // celah supaya guard tidak menolak sesuatu yang memang harus dikerjakan.
    'docs/ai/A11Y_REPORT.md',
    'docs/ai/PERFORMANCE_REPORT.md',
    'docs/ai/BACKLOG.md',
    'docs/ai/UAT_SKENARIO.md',
    'docs/ai/UAT_HASIL.md',
    // T-099 menghasilkan endpoint unduh dan komponen NotaImage bersama laporan
    // uji cetaknya; ketiganya dibiarkan di satu lane agar task tidak terbelah.
    'docs/ai/UJI_CETAK.md',
    'docs/panduan/**',

    // Rentang ADR lane ui: 040-059
    'docs/adr/ADR-04*.md',
    'docs/adr/ADR-05*.md',
  ],
};

/** Tidak boleh disentuh lane mana pun selama kerja paralel. */
const BEKU: string[] = [
  'docs/PRD.md',
  'docs/SYSTEM_DESIGN.md',
  'docs/USER_FLOW.md',
  'docs/DESIGN_SYSTEM.md',
  'docs/AI_EXECUTION_PLAN.md',
  'docs/ai/AGENT_RULES.md',
  'docs/ai/PARALLEL_PROTOCOL.md',
  'docs/ai/tasks.json',
  'docs/ai/tasks/**',
  'docs/ai/lanes/LANE-DATA.md',
  'docs/ai/lanes/LANE-UI.md',
  'docs/adr/README.md',
  // ADR 001-019 dibuat sebelum kerja paralel dan tidak dimiliki lane mana pun.
  //
  // ADR-010 SENGAJA TIDAK ADA di daftar ini: T-062 mengimplementasikan
  // strategi PDF yang ditetapkannya dan perlu memperbarui statusnya. Karena
  // pemilik() memeriksa BEKU LEBIH DULU daripada MILIK, satu-satunya cara
  // memberikannya kepada sebuah lane adalah mengeluarkannya dari sini.
  'docs/adr/ADR-00*.md',
  'docs/adr/ADR-011*.md',
  'docs/adr/ADR-012*.md',
  'docs/adr/ADR-013*.md',
  'docs/adr/ADR-014*.md',
  'docs/adr/ADR-015*.md',
  'docs/adr/ADR-016*.md',
  'docs/adr/ADR-017*.md',
  'docs/adr/ADR-018*.md',
  'CLAUDE.md',
  'AGENTS.md',
  '.gitignore',
  'Design/**',
  'Template/**',
];

/** Rentang nomor ADR per lane, supaya tidak pernah tabrakan nomor. */
const RENTANG_ADR: Record<Lane, [number, number]> = {
  data: [20, 39],
  ui: [40, 59],
};

const NAMA: Record<Lane, string> = {
  data: 'DATA & PLATFORM',
  ui: 'ANTARMUKA & DESIGN SYSTEM',
};
const BRANCH: Record<Lane, string> = { data: 'lane/data', ui: 'lane/ui' };

// ---------------------------------------------------------------------------
// Pencocokan glob sederhana: mendukung ** dan *
// ---------------------------------------------------------------------------

function cocok(pola: string, jalur: string): boolean {
  const re = new RegExp(
    '^' +
      pola
        .split('**')
        .map((bagian) => bagian.split('*').map(escapeRe).join('[^/]*'))
        .join('.*') +
      '$'
  );
  return re.test(jalur);
}
function escapeRe(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

function pemilik(jalur: string): Lane | 'BEKU' | null {
  if (BEKU.some((p) => cocok(p, jalur))) return 'BEKU';
  for (const l of ['data', 'ui'] as Lane[]) {
    if (MILIK[l].some((p) => cocok(p, jalur))) return l;
  }
  return null;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

function bacaState(l: Lane): StateLane {
  const f = fileState(l);
  if (!fs.existsSync(f)) {
    console.error(`\n  State lane "${l}" belum ada: ${f}`);
    console.error('  Jalankan: npx tsx scripts/lane.ts sync --init\n');
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(f, 'utf8')) as StateLane;
}

function tulisState(s: StateLane): void {
  fs.writeFileSync(fileState(s.lane), JSON.stringify(s, null, 2) + '\n', 'utf8');
}

/** Task DONE di lane lain juga memuaskan dependency. */
function semuaDone(): Set<string> {
  const done = new Set<string>();
  const tasks = JSON.parse(fs.readFileSync(TASKS, 'utf8')) as { tasks: Tugas[] };
  tasks.tasks.filter((t) => t.status === 'DONE').forEach((t) => done.add(t.id));
  for (const l of ['data', 'ui'] as Lane[]) {
    if (!fs.existsSync(fileState(l))) continue;
    const s = JSON.parse(fs.readFileSync(fileState(l), 'utf8')) as StateLane;
    s.tasks.filter((t) => t.status === 'DONE').forEach((t) => done.add(t.id));
  }
  return done;
}

function promosi(s: StateLane): void {
  const done = semuaDone();
  for (const t of s.tasks) {
    if (t.status !== 'TODO' && t.status !== 'READY') continue;
    t.status = t.depends_on.every((d) => done.has(d)) ? 'READY' : 'TODO';
  }
}

// ---------------------------------------------------------------------------
// Perintah
// ---------------------------------------------------------------------------

function cmdStatus(l: Lane): number {
  const s = bacaState(l);
  promosi(s);
  tulisState(s);

  const hitung = (st: Status) => s.tasks.filter((t) => t.status === st).length;
  console.log(`\n  LANE ${l.toUpperCase()} — ${s.nama}`);
  console.log(`  Branch: ${s.branch}   |   ADR: ${s.adr_range[0]}–${s.adr_range[1]}`);
  console.log(
    `  DONE ${hitung('DONE')}/${s.tasks.length}  ·  READY ${hitung('READY')}  ·  ` +
      `IN_PROGRESS ${hitung('IN_PROGRESS')}  ·  BLOCKED ${hitung('BLOCKED')}\n`
  );

  const jalan = s.tasks.filter((t) => t.status === 'IN_PROGRESS');
  if (jalan.length) {
    console.log('  SEDANG DIKERJAKAN:');
    jalan.forEach((t) => console.log(`    ${t.id}  ${t.judul}`));
    console.log('');
  }

  const blok = s.tasks.filter((t) => t.status === 'BLOCKED');
  if (blok.length) {
    console.log('  TERBLOKIR:');
    blok.forEach((t) => console.log(`    ${t.id}  ${t.judul}\n          ${t.blocked_reason ?? ''}`));
    console.log('');
  }

  const siap = s.tasks.filter((t) => t.status === 'READY');
  if (!siap.length) {
    console.log('  Tidak ada task READY. Kemungkinan menunggu sync atau lane lain.\n');
    return 0;
  }
  console.log('  BERIKUTNYA (ambil yang paling atas):');
  siap.forEach((t, i) => {
    const tanda = t.butuh_manusia ? ' [butuh manusia]' : '';
    console.log(`    ${i === 0 ? '->' : '  '} ${t.id}  ${t.judul}${tanda}`);
  });
  console.log(`\n  Mulai dengan: npx tsx scripts/lane.ts claim ${l} ${siap[0]!.id}\n`);
  return 0;
}

function cmdClaim(l: Lane, id: string): number {
  const s = bacaState(l);
  promosi(s);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) {
    console.error(`\n  ${id} bukan milik lane ${l}. Cek: npx tsx scripts/lane.ts status ${l}\n`);
    return 1;
  }
  if (t.status === 'DONE') {
    console.error(`\n  ${id} sudah DONE.\n`);
    return 1;
  }
  const done = semuaDone();
  const belum = t.depends_on.filter((d) => !done.has(d));
  if (belum.length) {
    console.error(`\n  TOLAK: ${id} punya dependency yang belum DONE -> ${belum.join(', ')}`);
    console.error('  Jangan mulai. Tunggu lane lain, atau ambil task READY lain.\n');
    return 1;
  }
  const lain = s.tasks.filter((x) => x.status === 'IN_PROGRESS' && x.id !== id);
  if (lain.length) {
    console.error(`\n  TOLAK: masih ada task berjalan -> ${lain.map((x) => x.id).join(', ')}`);
    console.error('  Satu task per lane pada satu waktu (AGENT_RULES P-01).\n');
    return 1;
  }
  t.status = 'IN_PROGRESS';
  tulisState(s);
  console.log(`\n  ${id} -> IN_PROGRESS  (lane ${l})`);
  console.log(`  Baca kontraknya di docs/ai/tasks/P${t.fase}-*.md\n`);
  return 0;
}

function cmdDone(l: Lane, id: string): number {
  const s = bacaState(l);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) {
    console.error(`\n  ${id} bukan milik lane ${l}.\n`);
    return 1;
  }
  const done = semuaDone();
  const belum = t.depends_on.filter((d) => !done.has(d));
  if (belum.length) {
    console.error(`\n  TOLAK: dependency belum DONE -> ${belum.join(', ')}\n`);
    return 1;
  }
  t.status = 'DONE';
  t.completed_at = new Date().toISOString().slice(0, 10);
  delete t.blocked_reason;
  promosi(s);
  tulisState(s);
  console.log(`\n  ${id} -> DONE  (lane ${l})\n`);
  return cmdStatus(l);
}

function cmdBlock(l: Lane, id: string, alasan: string): number {
  const s = bacaState(l);
  const t = s.tasks.find((x) => x.id === id);
  if (!t) {
    console.error(`\n  ${id} bukan milik lane ${l}.\n`);
    return 1;
  }
  if (!alasan || alasan.length < 15) {
    console.error('\n  Alasan wajib diisi dan harus konkret (minimal 15 karakter).\n');
    return 1;
  }
  t.status = 'BLOCKED';
  t.blocked_reason = alasan;
  tulisState(s);
  console.log(`\n  ${id} -> BLOCKED: ${alasan}\n`);
  return 0;
}

/** Inti pencegahan bentrok: tolak commit yang menyentuh file milik lane lain. */
function cmdGuard(l: Lane): number {
  let keluaran: string;
  try {
    // -uall wajib: tanpa itu git meringkas folder untracked jadi satu baris 'folder/'
    keluaran = execSync('git status --porcelain -uall', { encoding: 'utf8' });
  } catch {
    console.error('\n  Bukan repositori git atau git tidak tersedia.\n');
    return 1;
  }

  const berubah = keluaran
    .split('\n')
    .map((b) => b.trim())
    .filter(Boolean)
    .map((b) => b.replace(/^\S+\s+/, '').replace(/^"|"$/g, ''))
    .map((b) => (b.includes(' -> ') ? b.split(' -> ')[1]! : b))
    .map((b) => b.replace(/\\/g, '/'));

  if (!berubah.length) {
    console.log(`\n  [ OK ] Tidak ada perubahan. Lane ${l} bersih.\n`);
    return 0;
  }

  const milikku: string[] = [];
  const bukanMilikku: { file: string; pemilik: string }[] = [];

  for (const f of berubah) {
    const p = pemilik(f);
    if (p === l) milikku.push(f);
    else if (p === 'BEKU') bukanMilikku.push({ file: f, pemilik: 'BEKU (tidak boleh diubah siapa pun)' });
    else if (p === null) bukanMilikku.push({ file: f, pemilik: 'TIDAK TERDAFTAR — angkat ke sync point' });
    else bukanMilikku.push({ file: f, pemilik: `lane ${p}` });
  }

  console.log(`\n  guard — lane ${l.toUpperCase()}\n`);
  if (milikku.length) {
    console.log(`  Milik lane ini (${milikku.length}):`);
    milikku.forEach((f) => console.log(`    OK   ${f}`));
  }
  if (bukanMilikku.length) {
    console.log(`\n  PELANGGARAN (${bukanMilikku.length}):`);
    bukanMilikku.forEach((x) => console.log(`    XX   ${x.file}\n         -> milik ${x.pemilik}`));
    console.log('\n  JANGAN COMMIT. Kembalikan file di atas:');
    console.log(`    git checkout -- ${bukanMilikku.map((x) => x.file).join(' ')}`);
    console.log('  Bila perubahan itu memang perlu, angkat sebagai sync point ke manusia.\n');
    return 1;
  }
  console.log(`\n  [ OK ] Seluruh perubahan berada di dalam lane ${l}. Aman di-commit.\n`);
  return 0;
}

/** Satukan state kedua lane ke tasks.json. Dijalankan di branch integrasi. */
function cmdSync(): number {
  const db = JSON.parse(fs.readFileSync(TASKS, 'utf8')) as {
    tasks: Tugas[];
    ringkasan: { total: number; done: number; blocked: number; butuh_manusia: number };
  };
  const by = new Map(db.tasks.map((t) => [t.id, t]));
  let diperbarui = 0;
  const konflik: string[] = [];

  for (const l of ['data', 'ui'] as Lane[]) {
    if (!fs.existsSync(fileState(l))) continue;
    const s = JSON.parse(fs.readFileSync(fileState(l), 'utf8')) as StateLane;
    for (const t of s.tasks) {
      const induk = by.get(t.id);
      if (!induk) continue;
      if (t.status === 'IN_PROGRESS') {
        konflik.push(`${t.id} masih IN_PROGRESS di lane ${l} — selesaikan dulu sebelum sync`);
        continue;
      }
      if (induk.status !== t.status) {
        induk.status = t.status;
        induk.completed_at = t.completed_at;
        if (t.blocked_reason) induk.blocked_reason = t.blocked_reason;
        else delete induk.blocked_reason;
        diperbarui++;
      }
    }
  }

  // Promosi global TODO -> READY
  const done = new Set(db.tasks.filter((t) => t.status === 'DONE').map((t) => t.id));
  for (const t of db.tasks) {
    if (t.status !== 'TODO' && t.status !== 'READY') continue;
    t.status = t.depends_on.every((d) => done.has(d)) ? 'READY' : 'TODO';
  }

  db.ringkasan.done = db.tasks.filter((t) => t.status === 'DONE').length;
  db.ringkasan.blocked = db.tasks.filter((t) => t.status === 'BLOCKED').length;
  fs.writeFileSync(TASKS, JSON.stringify(db, null, 2) + '\n', 'utf8');

  console.log(`\n  sync — ${diperbarui} task diperbarui ke docs/ai/tasks.json`);
  console.log(`  DONE ${db.ringkasan.done}/${db.tasks.length}  ·  BLOCKED ${db.ringkasan.blocked}`);
  if (konflik.length) {
    console.log('\n  PERINGATAN:');
    konflik.forEach((k) => console.log(`    ${k}`));
  }
  console.log('');
  return konflik.length ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Task turunan — separuh sebuah task yang dikerjakan lane lain
// ---------------------------------------------------------------------------

/**
 * Sebagian task di `tasks.json` CAMPUR: satu task membuat service di `lib/`
 * dan halaman di `app/` sekaligus. Yang begitu dibelah, dan separuh keduanya
 * perlu punya identitas sendiri.
 *
 * Kenapa tidak menambah entri ke `tasks.json` saja: berkas itu BEKU selama
 * kerja paralel dan tidak boleh disunting lane mana pun. Karena itu separuh
 * yang dikerjakan belakangan didaftarkan di sini sebagai task turunan dengan
 * akhiran `-UI` atau `-DATA`, dan `depends_on`-nya menunjuk task induknya.
 *
 * Ketergantungan itu bukan hiasan. Tanpa `depends_on: ['T-047']`,
 * `T-047-UI` akan tampil READY sejak hari pertama, dan lane ui akan mulai
 * menulis route handler untuk fungsi yang belum ada tanda tangannya.
 *
 * Sumber: docs/ai/RENCANA-GELOMBANG-3.md
 */
const TURUNAN: Record<string, { fase: number; judul: string; depends_on: string[] }> = {
  'T-065-UI': {
    fase: 3,
    judul: 'Route handler proker (separuh ui T-065)',
    depends_on: ['T-065'],
  },
  'T-047-UI': { fase: 1, judul: 'Halaman & API undangan/manajemen user', depends_on: ['T-047'] },
  'T-048-UI': { fase: 1, judul: 'Halaman & API import massal user', depends_on: ['T-048'] },
  'T-068-UI': { fase: 3, judul: 'Wizard proker langkah 1-3 (tampilan)', depends_on: ['T-068'] },
  'T-070-UI': { fase: 3, judul: 'Halaman & API approval proker', depends_on: ['T-070'] },
  'T-071-UI': { fase: 3, judul: 'Halaman edit proker terkunci', depends_on: ['T-071'] },
  'T-076-UI': { fase: 3, judul: 'Banner koneksi & langganan MasterGantt', depends_on: ['T-076'] },
  'T-079-UI': { fase: 3, judul: 'Route handler cron harian', depends_on: ['T-079'] },
  'T-083-UI': { fase: 4, judul: 'DeadlineBadge di kartu Kanban', depends_on: ['T-083'] },
  'T-113-UI': { fase: 9, judul: 'Terapkan sanitasi di route handler', depends_on: ['T-113'] },
};

// ---------------------------------------------------------------------------
// Pelonggaran dependensi — akibat penundaan fase berat
// ---------------------------------------------------------------------------

/**
 * Empat task gelombang ketiga bergantung pada task di fase yang DITUNDA
 * pemilik produk (persuratan P2, TOR P6, LPJ P7, restore P9). Dibiarkan apa
 * adanya, keempatnya tidak akan pernah READY dan bundel "fitur ringan" tidak
 * dapat diselesaikan sama sekali.
 *
 * `depends_on` aslinya ada di `tasks.json` yang BEKU dan tidak boleh disunting
 * lane mana pun. Karena itu pelonggarannya dicatat di sini — eksplisit, dengan
 * alasan per baris, dan mudah dicabut kembali begitu fase beratnya dikerjakan.
 *
 * Yang dilonggarkan HANYA ketergantungan pada fase yang ditunda. Ketergantungan
 * antar-task di dalam gelombang ini tidak disentuh: melonggarkannya berarti
 * mengizinkan halaman ditulis sebelum service yang dipanggilnya ada.
 *
 * Konsekuensinya nyata dan harus disebut di laporan task masing-masing: bagian
 * yang bergantung pada fase tertunda TIDAK ikut selesai, dan task-nya ditutup
 * dengan catatan itu. Bukan dianggap tidak pernah ada.
 *
 * Sumber: docs/ai/RENCANA-GELOMBANG-3.md · keputusan pemilik produk 2026-09-04
 */
const PELONGGARAN: Record<string, { buang: string[]; alasan: string }> = {
  'T-077': {
    buang: ['T-060'],
    alasan:
      'Panel Sekum memuat antrean approval surat. Dashboard dibangun tanpa panel itu; ' +
      'panelnya menyusul bersama P2.',
  },
  'T-106': {
    buang: ['T-061'],
    alasan:
      'Endpoint generate notulensi memakai Document Engine DOCX. Notulensi dibangun ' +
      'tanpa endpoint generate; endpointnya menyusul bersama T-061.',
  },
  'T-108': {
    buang: ['T-058'],
    alasan:
      'Peminjaman ruangan menautkan surat peminjaman. Booking dibangun tanpa tautan itu; ' +
      'tautannya menyusul bersama P2.',
  },
  'T-113': {
    buang: ['T-105', 'T-096', 'T-112'],
    alasan:
      'Hardening mengaudit rute yang ADA saat ia dijalankan. Dijalankan atas rute gelombang ' +
      'ini, dan WAJIB diulang setelah fase berat masuk — audit lama tidak mencakup rute baru.',
  },
};

/** `depends_on` setelah pelonggaran diterapkan. */
function dependensi(t: { id: string; depends_on: string[] }): string[] {
  const p = PELONGGARAN[t.id];
  if (!p) return t.depends_on;
  return t.depends_on.filter((d) => !p.buang.includes(d));
}

/** Bangun ulang berkas state kedua lane dari tasks.json + pembagian task. */
function cmdInit(): number {
  const PEMBAGIAN: Record<Lane, string[]> = {
    data: [
      'T-004', 'T-010', 'T-011', 'T-097',
      'T-019', 'T-020', 'T-021', 'T-022', 'T-023', 'T-024', 'T-025', 'T-026',
      'T-027', 'T-028', 'T-029', 'T-030', 'T-031', 'T-032', 'T-033', 'T-034',
      'T-035', 'T-036', 'T-037', 'T-038', 'T-039', 'T-040', 'T-041', 'T-042',
      'T-043', 'T-044',

      // Gelombang kedua. PEMBAGIAN di atas hanya pernah menutup fase 0-2
      // fondasi; 73 task sisanya belum pernah dibagi ke lane mana pun.
      //
      // T-045 dan T-046 masuk lebih dulu karena keduanya murni backend —
      // seluruh berkas yang dibuatnya ada di lib/auth/. Sisa task fase 1 ke
      // atas sebagian besar CAMPUR: satu task membuat service di lib/ dan
      // halaman di app/ sekaligus, sehingga harus dibelah di dalam task
      // seperti T-045, bukan diberikan utuh ke satu lane. Pembelahannya
      // keputusan manusia di sync point, bukan keputusan agent.
      'T-045', 'T-046',

      // T-086 sudah dikerjakan dan DONE di state-data.json sebelum sempat
      // dicatat di sini; didaftarkan supaya keduanya tidak berbeda.
      'T-086',

      // ---------------------------------------------------------------------
      // GELOMBANG KETIGA — fitur ringan lebih dulu, surat dan dokumen berat
      // ditunda. Keputusan pemilik produk 2026-09-04.
      //
      // Pembelahan ke-26 task dilakukan SEKALIGUS di sini, bukan satu per satu
      // saat diklaim. Cara lama sudah dua kali menghentikan pekerjaan di
      // tengah: T-074 dan T-078 sama-sama baru ketahuan butuh berkas milik
      // lane lain SETELAH separuhnya selesai ditulis. Rinciannya di
      // docs/ai/RENCANA-GELOMBANG-3.md.
      // ---------------------------------------------------------------------
      'T-065', 'T-066',

      // Separuh data dari task campuran. Seluruhnya menulis di lib/** milik
      // lane ini, dan seluruhnya harus selesai LEBIH DULU daripada separuh
      // ui-nya — lihat TURUNAN di bawah.
      'T-047',   // lib/auth/invitation.ts
      'T-048',   // lib/import/parse-tabel.ts
      'T-068',   // lib/proker/wizard-state.ts
      'T-070',   // lib/kepanitiaan/bentuk-otomatis.ts
      'T-071',   // lib/proker/klasifikasi-perubahan.ts
      'T-076',   // lib/realtime/**  + migrasi 020_realtime.sql
      'T-079',   // lib/cron/** + vercel.json
      'T-083',   // lib/deadline.ts + lib/cron/cek-deadline.ts
      'T-113',   // lib/security/** + next.config.ts + middleware.ts
    ],
    ui: [
      'T-012', 'T-013', 'T-014', 'T-015', 'T-016', 'T-017', 'T-018',
      'T-072', 'T-073', 'T-074', 'T-078',

      // ---------------------------------------------------------------------
      // GELOMBANG KETIGA
      // ---------------------------------------------------------------------

      // Murni tampilan: seluruh berkasnya jatuh di app/** dan components/**.
      'T-049', 'T-050', 'T-051', 'T-052', 'T-053',
      'T-067', 'T-069', 'T-075', 'T-077',
      'T-080', 'T-081', 'T-082',
      'T-106', 'T-107', 'T-108', 'T-109',

      // Separuh ui dari task campuran. Masing-masing menunggu induknya selesai
      // di lane data supaya tanda tangan yang dipanggilnya sudah ada.
      'T-065-UI', 'T-047-UI', 'T-048-UI', 'T-068-UI', 'T-070-UI',
      'T-071-UI', 'T-076-UI', 'T-079-UI', 'T-083-UI', 'T-113-UI',
    ],
  };

  const db = JSON.parse(fs.readFileSync(TASKS, 'utf8')) as { tasks: Tugas[] };
  const by = new Map(db.tasks.map((t) => [t.id, t]));
  fs.mkdirSync(DIR_LANE, { recursive: true });

  // =========================================================================
  // STATUS YANG SUDAH ADA DIPERTAHANKAN. INI BUKAN KENYAMANAN.
  // =========================================================================
  // Versi pertama membangun state SEPENUHNYA dari tasks.json. Karena tasks.json
  // dibekukan selama kerja paralel dan hanya diperbarui di sync point, seluruh
  // task yang selesai SESUDAH sync terakhir masih tercatat TODO di sana —
  // saat ini sepuluh, termasuk T-045, T-065, T-066, T-072, T-073, T-074.
  //
  // Menjalankan `sync --init` dengan versi itu akan mengembalikan kesepuluhnya
  // menjadi TODO tanpa satu pun peringatan, dan pekerjaan berminggu-minggu
  // hilang dari catatan. Berkasnya masih ada di git, tetapi tidak ada agent
  // yang akan tahu ia sudah dikerjakan; keduanya akan mengerjakannya lagi.
  //
  // Karena itu status diambil dari state lane yang sudah ada bila ada di sana,
  // dan dari tasks.json hanya untuk task yang benar-benar baru.
  const lama = new Map<string, Tugas>();
  for (const l of ['data', 'ui'] as Lane[]) {
    if (!fs.existsSync(fileState(l))) continue;
    const st = JSON.parse(fs.readFileSync(fileState(l), 'utf8')) as StateLane;
    st.tasks.forEach((t) => lama.set(`${l}:${t.id}`, t));
  }

  for (const l of ['data', 'ui'] as Lane[]) {
    const s: StateLane = {
      lane: l,
      nama: NAMA[l],
      branch: BRANCH[l],
      adr_range: RENTANG_ADR[l],
      milik: MILIK[l],
      tasks: PEMBAGIAN[l].map((id) => {
        const sebelumnya = lama.get(`${l}:${id}`);
        if (sebelumnya) return { ...sebelumnya, depends_on: dependensi(sebelumnya) };

        const induk = by.get(id);
        if (induk) return { ...induk, depends_on: dependensi(induk) };

        // Task turunan tidak ada di tasks.json yang beku; metadatanya di TURUNAN.
        const turunan = TURUNAN[id];
        if (!turunan) {
          throw new Error(
            `Task ${id} tidak ada di tasks.json maupun di TURUNAN (scripts/lane.ts).`,
          );
        }
        return {
          id,
          fase: turunan.fase,
          judul: turunan.judul,
          depends_on: turunan.depends_on,
          status: 'TODO' as Status,
          completed_at: null,
        };
      }),
    };
    promosi(s);
    tulisState(s);

    const hilang = [...lama.keys()]
      .filter((k) => k.startsWith(`${l}:`))
      .map((k) => k.slice(l.length + 1))
      .filter((id) => !PEMBAGIAN[l].includes(id));

    const siap = s.tasks.filter((t) => t.status === 'READY').length;
    const selesai = s.tasks.filter((t) => t.status === 'DONE').length;
    console.log(
      `  state-${l}.json  ${s.tasks.length} task, ${selesai} DONE, ${siap} siap dikerjakan`,
    );

    // Task yang hilang dari PEMBAGIAN tidak dibuang diam-diam. Kalau ia DONE,
    // menghapusnya berarti menghapus jejak pekerjaan yang sudah ada.
    if (hilang.length) {
      console.log(`      PERINGATAN: ${hilang.length} task dikeluarkan dari lane ini:`);
      hilang.forEach((id) => {
        const t = lama.get(`${l}:${id}`)!;
        console.log(`        ${id}  (${t.status})${t.status === 'DONE' ? '  <- SUDAH SELESAI' : ''}`);
      });
    }
  }

  const dilonggarkan = Object.keys(PELONGGARAN);
  if (dilonggarkan.length) {
    console.log('');
    console.log(`  ${dilonggarkan.length} task dilonggarkan dependensinya (fase tertunda):`);
    dilonggarkan.forEach((id) => {
      const p = PELONGGARAN[id]!;
      console.log(`    ${id}  tanpa ${p.buang.join(', ')}`);
      console.log(`          ${p.alasan}`);
    });
    console.log('');
    console.log('  Bagian yang bergantung pada fase tertunda TIDAK ikut selesai.');
    console.log('  Sebutkan itu di laporan task, jangan dianggap tidak pernah ada.');
  }
  return 0;
}

// ---------------------------------------------------------------------------

function main(): number {
  const [, , perintah, a, b, ...sisa] = process.argv;
  const lane = a as Lane;

  if (perintah !== 'sync' && perintah !== undefined && lane !== 'data' && lane !== 'ui') {
    console.error('\n  Lane harus "data" atau "ui".\n');
    return 1;
  }

  switch (perintah) {
    case 'status':
      return cmdStatus(lane);
    case 'claim':
      return cmdClaim(lane, b!);
    case 'done':
      return cmdDone(lane, b!);
    case 'block':
      return cmdBlock(lane, b!, sisa.join(' '));
    case 'guard':
      return cmdGuard(lane);
    case 'sync':
      return a === '--init' ? cmdInit() : cmdSync();
    default:
      console.log(`
  lane — koordinasi dua agent

    npx tsx scripts/lane.ts status <data|ui>
    npx tsx scripts/lane.ts claim  <data|ui> <T-0XX>
    npx tsx scripts/lane.ts done   <data|ui> <T-0XX>
    npx tsx scripts/lane.ts block  <data|ui> <T-0XX> "alasan"
    npx tsx scripts/lane.ts guard  <data|ui>     <- WAJIB sebelum commit
    npx tsx scripts/lane.ts sync                 <- di branch integrasi
    npx tsx scripts/lane.ts sync --init          <- bangun ulang state lane
`);
      return 0;
  }
}

process.exit(main());
