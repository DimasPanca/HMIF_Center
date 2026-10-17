/**
 * sanitize — pintu tunggal sanitasi konten kaya (SYSTEM_DESIGN §18.1 XSS,
 * T-113 kontrak 3). SERVER-ONLY.
 *
 * Dua bentuk konten kaya, dua penyaring allowlist, keduanya diterapkan di
 * KEDUA sisi — saat simpan dan saat dibaca untuk dirender:
 *
 *   ProseMirror JSON (TipTap)   sanitasiKonten   notulensi, job desk, TOR, proposal
 *   HTML isi surat              sanitasiIsiHtml  surat (draft → preview → DOCX)
 *
 *   Fitur        simpan                               baca/render
 *   notulensi    lib/notulensi/service.ts buat/perbarui detailNotulensi (T-113)
 *   job desk     lib/acara/job-desk.ts simpan         muatJobDesk
 *   TOR          lib/tor/service.ts simpanTor         muatTor (sanitasiData)
 *   proposal     lib/proposal/service.ts simpan       muatProposal (sanitasiData)
 *   surat        lib/surat/draft.ts                   lib/surat/render-preview.ts,
 *                                                     lib/documents/data-mapper.ts
 *
 * Satu-satunya `dangerouslySetInnerHTML` berisi data pengguna
 * (components/surat/SuratPreview.tsx) hanya menerima keluaran
 * render-preview yang sudah melewati `sanitasiIsiHtml`.
 *
 * Sumber: docs/ai/tasks/P9-rilis.md T-113 · lib/notulensi/sanitasi.ts · lib/surat/isi-html.ts
 */

export { sanitasiKonten, type NodeProseMirror } from '@/lib/notulensi/sanitasi';
export { sanitasiIsiHtml } from '@/lib/surat/isi-html';
