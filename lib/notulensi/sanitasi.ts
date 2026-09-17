/**
 * sanitasi — allowlist keluaran editor TipTap (ProseMirror JSON) + ekstraksi
 * teks datar untuk pencarian. SERVER-ONLY (dipakai service saat simpan/render).
 *
 * ===========================================================================
 * ALLOWLIST PADA JSON, BUKAN SANITASI HTML
 * ===========================================================================
 * Konten disimpan sebagai JSON ProseMirror (`notulensi.konten`), bukan HTML.
 * Jadi sanitasi = MENYARING pohon node/mark terhadap daftar yang diizinkan,
 * lebih aman daripada membersihkan HTML: node/mark/atribut asing dibuang, href
 * tautan dibatasi skema aman. Diterapkan SEBELUM SIMPAN dan boleh diterapkan
 * ulang SEBELUM RENDER (pertahanan berlapis). Cocok untuk TipTap yang ada:
 * starter-kit + table + task-list (@tiptap 3.x).
 *
 * Sumber: docs/ai/tasks/P8-kesekretariatan.md T-106 · PRD M13 ·
 *         docs/ai/NOTULENSI_CONTRACT.md
 */

export interface NodeProseMirror {
  type: string;
  content?: NodeProseMirror[];
  text?: string;
  marks?: MarkProseMirror[];
  attrs?: Record<string, unknown>;
}
interface MarkProseMirror {
  type: string;
  attrs?: Record<string, unknown>;
}

/** Node yang diizinkan → atribut yang dipertahankan (fungsi penyaring nilai). */
const NODE_DIIZINKAN: Record<string, (attrs: Record<string, unknown>) => Record<string, unknown>> = {
  doc: () => ({}),
  paragraph: () => ({}),
  text: () => ({}),
  hardBreak: () => ({}),
  horizontalRule: () => ({}),
  blockquote: () => ({}),
  bulletList: () => ({}),
  orderedList: (a) => petik(a, { start: intPositif }),
  listItem: () => ({}),
  taskList: () => ({}),
  taskItem: (a) => petik(a, { checked: (v) => (typeof v === 'boolean' ? v : false) }),
  heading: (a) => petik(a, { level: (v) => (v === 1 || v === 2 || v === 3 ? v : 2) }),
  table: () => ({}),
  tableRow: () => ({}),
  tableCell: (a) => petik(a, { colspan: intPositif, rowspan: intPositif }),
  tableHeader: (a) => petik(a, { colspan: intPositif, rowspan: intPositif }),
};

const MARK_DIIZINKAN: Record<string, (attrs: Record<string, unknown>) => Record<string, unknown> | null> = {
  bold: () => ({}),
  italic: () => ({}),
  underline: () => ({}),
  strike: () => ({}),
  code: () => ({}),
  link: (a) => {
    const href = typeof a.href === 'string' ? a.href.trim() : '';
    // Hanya skema aman; buang javascript:, data:, dsb.
    return /^(https?:\/\/|mailto:)/i.test(href) ? { href } : null;
  },
};

function intPositif(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isInteger(v) && v > 0 ? v : undefined;
}

function petik(
  attrs: Record<string, unknown>,
  aturan: Record<string, (v: unknown) => unknown>,
): Record<string, unknown> {
  const keluar: Record<string, unknown> = {};
  for (const [kunci, saring] of Object.entries(aturan)) {
    const nilai = saring(attrs[kunci]);
    if (nilai !== undefined) keluar[kunci] = nilai;
  }
  return keluar;
}

function saringMarks(marks: unknown): MarkProseMirror[] | undefined {
  if (!Array.isArray(marks)) return undefined;
  const hasil: MarkProseMirror[] = [];
  for (const m of marks) {
    if (!m || typeof m !== 'object' || typeof (m as MarkProseMirror).type !== 'string') continue;
    const tipe = (m as MarkProseMirror).type;
    const saring = MARK_DIIZINKAN[tipe];
    if (!saring) continue;
    const attrs = saring(((m as MarkProseMirror).attrs ?? {}) as Record<string, unknown>);
    if (attrs === null) continue; // mis. link href tak aman
    hasil.push(Object.keys(attrs).length ? { type: tipe, attrs } : { type: tipe });
  }
  return hasil.length ? hasil : undefined;
}

function saringNode(node: unknown): NodeProseMirror | null {
  if (!node || typeof node !== 'object') return null;
  const n = node as NodeProseMirror;
  if (typeof n.type !== 'string' || !(n.type in NODE_DIIZINKAN)) return null;

  const keluar: NodeProseMirror = { type: n.type };
  const attrs = NODE_DIIZINKAN[n.type]!((n.attrs ?? {}) as Record<string, unknown>);
  if (Object.keys(attrs).length) keluar.attrs = attrs;

  if (n.type === 'text') {
    keluar.text = typeof n.text === 'string' ? n.text : '';
    const marks = saringMarks(n.marks);
    if (marks) keluar.marks = marks;
    return keluar.text ? keluar : null; // buang node teks kosong
  }

  if (Array.isArray(n.content)) {
    const isi = n.content.map(saringNode).filter((x): x is NodeProseMirror => x !== null);
    if (isi.length) keluar.content = isi;
  }
  return keluar;
}

/** Dokumen kosong yang sah bila input tak dapat disanitasi. */
const DOKUMEN_KOSONG: NodeProseMirror = { type: 'doc', content: [{ type: 'paragraph' }] };

/** Sanitasi dokumen TipTap. Selalu mengembalikan `doc` yang sah. */
export function sanitasiKonten(input: unknown): NodeProseMirror {
  const bersih = saringNode(input);
  if (!bersih || bersih.type !== 'doc') return DOKUMEN_KOSONG;
  if (!bersih.content || bersih.content.length === 0) return DOKUMEN_KOSONG;
  return bersih;
}

/** Teks datar semua node teks, satu spasi antar-blok. Untuk indeks pencarian. */
export function ekstrakTeks(input: unknown): string {
  const potong: string[] = [];
  const jelajah = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    const n = node as NodeProseMirror;
    if (typeof n.text === 'string') potong.push(n.text);
    if (Array.isArray(n.content)) n.content.forEach(jelajah);
  };
  jelajah(input);
  return potong.join(' ').replace(/\s+/g, ' ').trim();
}

/** Teks per-blok tingkat atas (untuk agenda DOCX). */
export function ekstrakBlok(input: unknown): string[] {
  if (!input || typeof input !== 'object') return [];
  const doc = input as NodeProseMirror;
  if (!Array.isArray(doc.content)) return [];
  return doc.content
    .map((blok) => ekstrakTeks(blok))
    .filter((t) => t.length > 0);
}
