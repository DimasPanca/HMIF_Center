'use client';

/**
 * IsiSuratEditor — editor "Isi surat" yang sengaja sempit (kontrak T-058 butir 7).
 *
 * Hanya paragraf, tebal, miring, dan daftar. Alasannya bukan selera: isi surat
 * dicetak ke `{isi_paragraf}` di template resmi yang sudah punya font, ukuran,
 * dan perataannya sendiri. Judul, kutipan, atau tautan tidak punya padanan di
 * kop surat HMIF dan hanya akan hilang atau merusak tata letak saat generate.
 *
 * Keluarannya HTML. Server tetap membersihkannya dengan allowlist yang sama
 * sempitnya (`lib/surat/isi-html.ts`), jadi editor ini bukan penjaga keamanan.
 */

import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Redo2, Undo2, type LucideIcon } from 'lucide-react';
import * as React from 'react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const EKSTENSI = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    code: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: false,
  }),
];

interface Aksi {
  label: string;
  ikon: LucideIcon;
  jalankan: (e: Editor) => void;
  aktif?: (e: Editor) => boolean;
  bisa?: (e: Editor) => boolean;
}

const AKSI: Aksi[] = [
  { label: 'Tebal', ikon: Bold, jalankan: (e) => e.chain().focus().toggleBold().run(), aktif: (e) => e.isActive('bold') },
  { label: 'Miring', ikon: Italic, jalankan: (e) => e.chain().focus().toggleItalic().run(), aktif: (e) => e.isActive('italic') },
  { label: 'Daftar berpoin', ikon: List, jalankan: (e) => e.chain().focus().toggleBulletList().run(), aktif: (e) => e.isActive('bulletList') },
  { label: 'Daftar bernomor', ikon: ListOrdered, jalankan: (e) => e.chain().focus().toggleOrderedList().run(), aktif: (e) => e.isActive('orderedList') },
  { label: 'Urungkan', ikon: Undo2, jalankan: (e) => e.chain().focus().undo().run(), bisa: (e) => e.can().undo() },
  { label: 'Ulangi', ikon: Redo2, jalankan: (e) => e.chain().focus().redo().run(), bisa: (e) => e.can().redo() },
];

function Toolbar({ editor }: { editor: Editor | null }) {
  const keadaan = useEditorState({
    editor,
    selector: ({ editor: e }) => (e ? AKSI.map((a) => ({ aktif: a.aktif?.(e) ?? false, bisa: a.bisa?.(e) ?? true })) : null),
  });
  return (
    <div role="toolbar" aria-label="Format isi surat" className="flex flex-wrap items-center gap-0.5 border-b border-subtle bg-subtle px-2 py-1">
      {AKSI.map((aksi, i) => {
        const s = keadaan?.[i];
        const Ikon = aksi.ikon;
        return (
          <Button
            key={aksi.label}
            type="button"
            variant="ghost"
            aria-label={aksi.label}
            title={aksi.label}
            aria-pressed={aksi.aktif ? Boolean(s?.aktif) : undefined}
            disabled={!editor || s?.bisa === false}
            // Tanpa ini tombol mencuri fokus dan teks jatuh di luar node baru (HANDOFF §4 no. 7).
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor && aksi.jalankan(editor)}
            className={cn('w-[34px] px-0', s?.aktif && 'bg-muted text-primary')}
          >
            <Ikon aria-hidden="true" />
          </Button>
        );
      })}
    </div>
  );
}

export interface IsiSuratEditorProps {
  id?: string;
  html: string;
  onChange: (html: string) => void;
  onBlur?: () => void;
  invalid?: boolean;
}

export function IsiSuratEditor({ id, html, onChange, onBlur, invalid }: IsiSuratEditorProps) {
  const editor = useEditor({
    extensions: EKSTENSI,
    content: html,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        ...(id ? { id } : {}),
        'aria-label': 'Isi surat',
        role: 'textbox',
        'aria-multiline': 'true',
        ...(invalid ? { 'aria-invalid': 'true' } : {}),
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? '' : e.getHTML()),
    onBlur: () => onBlur?.(),
  });

  // Nilai dari luar (mis. memuat draft) disinkronkan tanpa memicu onUpdate.
  React.useEffect(() => {
    if (!editor) return;
    const kini = editor.isEmpty ? '' : editor.getHTML();
    if (html !== kini) editor.commands.setContent(html || '', { emitUpdate: false });
  }, [editor, html]);

  return (
    <div
      data-testid="surat-isi-editor"
      className={cn(
        'notulensi-prosa overflow-hidden rounded-sm border bg-panel focus-within:border-[var(--border-focus)]',
        invalid ? 'border-[var(--danger)]' : 'border-[var(--text-tertiary)]',
      )}
    >
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
