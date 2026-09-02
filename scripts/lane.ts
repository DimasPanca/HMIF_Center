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
    'lib/README.md',
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
  'docs/adr/ADR-00*.md',
  'docs/adr/ADR-01*.md',
  'CLAUDE.md',
  'AGENTS.md',
  'README.md',
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

/** Bangun ulang berkas state kedua lane dari tasks.json + pembagian task. */
function cmdInit(): number {
  const PEMBAGIAN: Record<Lane, string[]> = {
    data: [
      'T-004', 'T-010', 'T-011', 'T-097',
      'T-019', 'T-020', 'T-021', 'T-022', 'T-023', 'T-024', 'T-025', 'T-026',
      'T-027', 'T-028', 'T-029', 'T-030', 'T-031', 'T-032', 'T-033', 'T-034',
      'T-035', 'T-036', 'T-037', 'T-038', 'T-039', 'T-040', 'T-041', 'T-042',
      'T-043', 'T-044',
    ],
    ui: [
      'T-012', 'T-013', 'T-014', 'T-015', 'T-016', 'T-017', 'T-018',
      'T-072', 'T-073', 'T-074', 'T-078',
    ],
  };

  const db = JSON.parse(fs.readFileSync(TASKS, 'utf8')) as { tasks: Tugas[] };
  const by = new Map(db.tasks.map((t) => [t.id, t]));
  fs.mkdirSync(DIR_LANE, { recursive: true });

  for (const l of ['data', 'ui'] as Lane[]) {
    const s: StateLane = {
      lane: l,
      nama: NAMA[l],
      branch: BRANCH[l],
      adr_range: RENTANG_ADR[l],
      milik: MILIK[l],
      tasks: PEMBAGIAN[l].map((id) => {
        const t = by.get(id);
        if (!t) throw new Error(`Task ${id} tidak ada di tasks.json`);
        return { ...t };
      }),
    };
    promosi(s);
    tulisState(s);
    const siap = s.tasks.filter((t) => t.status === 'READY').length;
    console.log(`  state-${l}.json  ${s.tasks.length} task, ${siap} siap dikerjakan`);
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
