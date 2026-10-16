'use client';

import { TableKit } from '@tiptap/extension-table';
import { TaskItem } from '@tiptap/extension-task-item';
import { TaskList } from '@tiptap/extension-task-list';
import { EditorContent, useEditor, useEditorState, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table2,
  Underline,
  Undo2,
  type LucideIcon,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface NotulensiEditorProps {
  konten: JSONContent;
  editable: boolean;
  onChange?: (konten: JSONContent) => void;
  /** Nama aksesibel area tulis — editor ini juga dipakai job desk divisi (T-093). */
  label?: string;
}

// Hanya node/mark yang lolos allowlist sanitasi server; codeBlock dimatikan karena akan dibuang.
const EKSTENSI = [
  StarterKit.configure({
    codeBlock: false,
    heading: { levels: [1, 2, 3] },
    link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
  }),
  TableKit.configure({ table: { resizable: false } }),
  TaskList,
  TaskItem.configure({ nested: true }),
];

interface AksiToolbar {
  label: string;
  ikon: LucideIcon;
  jalankan: (e: Editor) => void;
  aktif?: (e: Editor) => boolean;
  bisa?: (e: Editor) => boolean;
}

const GRUP_TOOLBAR: AksiToolbar[][] = [
  [
    { label: 'Judul 1', ikon: Heading1, jalankan: (e) => e.chain().focus().toggleHeading({ level: 1 }).run(), aktif: (e) => e.isActive('heading', { level: 1 }) },
    { label: 'Judul 2', ikon: Heading2, jalankan: (e) => e.chain().focus().toggleHeading({ level: 2 }).run(), aktif: (e) => e.isActive('heading', { level: 2 }) },
    { label: 'Judul 3', ikon: Heading3, jalankan: (e) => e.chain().focus().toggleHeading({ level: 3 }).run(), aktif: (e) => e.isActive('heading', { level: 3 }) },
  ],
  [
    { label: 'Tebal', ikon: Bold, jalankan: (e) => e.chain().focus().toggleBold().run(), aktif: (e) => e.isActive('bold') },
    { label: 'Miring', ikon: Italic, jalankan: (e) => e.chain().focus().toggleItalic().run(), aktif: (e) => e.isActive('italic') },
    { label: 'Garis bawah', ikon: Underline, jalankan: (e) => e.chain().focus().toggleUnderline().run(), aktif: (e) => e.isActive('underline') },
    { label: 'Coret', ikon: Strikethrough, jalankan: (e) => e.chain().focus().toggleStrike().run(), aktif: (e) => e.isActive('strike') },
  ],
  [
    { label: 'Daftar berpoin', ikon: List, jalankan: (e) => e.chain().focus().toggleBulletList().run(), aktif: (e) => e.isActive('bulletList') },
    { label: 'Daftar bernomor', ikon: ListOrdered, jalankan: (e) => e.chain().focus().toggleOrderedList().run(), aktif: (e) => e.isActive('orderedList') },
    { label: 'Checklist', ikon: ListChecks, jalankan: (e) => e.chain().focus().toggleTaskList().run(), aktif: (e) => e.isActive('taskList') },
    { label: 'Kutipan', ikon: Quote, jalankan: (e) => e.chain().focus().toggleBlockquote().run(), aktif: (e) => e.isActive('blockquote') },
  ],
  [
    {
      label: 'Sisipkan tabel',
      ikon: Table2,
      jalankan: (e) => e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
      bisa: (e) => e.can().insertTable({ rows: 3, cols: 3, withHeaderRow: true }),
    },
    { label: 'Garis pemisah', ikon: Minus, jalankan: (e) => e.chain().focus().setHorizontalRule().run() },
  ],
  [
    { label: 'Urungkan', ikon: Undo2, jalankan: (e) => e.chain().focus().undo().run(), bisa: (e) => e.can().undo() },
    { label: 'Ulangi', ikon: Redo2, jalankan: (e) => e.chain().focus().redo().run(), bisa: (e) => e.can().redo() },
  ],
];

const SEMUA_AKSI = GRUP_TOOLBAR.flat();

function Toolbar({ editor }: { editor: Editor | null }) {
  const keadaan = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? SEMUA_AKSI.map((a) => ({ aktif: a.aktif?.(e) ?? false, bisa: a.bisa?.(e) ?? true }))
        : null,
  });

  return (
    <div
      role="toolbar"
      aria-label="Format isi notulensi"
      className="flex flex-wrap items-center gap-1 border-b border-subtle bg-subtle px-2 py-1"
    >
      {GRUP_TOOLBAR.map((grup, gi) => (
        <div key={gi} className="flex items-center gap-0.5 [&:not(:first-child)]:border-l [&:not(:first-child)]:border-subtle [&:not(:first-child)]:pl-1">
          {grup.map((aksi) => {
            const i = SEMUA_AKSI.indexOf(aksi);
            const s = keadaan?.[i];
            const Ikon = aksi.ikon;
            return (
              <Button
                key={aksi.label}
                variant="ghost"
                aria-label={aksi.label}
                title={aksi.label}
                aria-pressed={aksi.aktif ? Boolean(s?.aktif) : undefined}
                disabled={!editor || s?.bisa === false}
                // Seleksi editor tetap utuh: tombol tidak mengambil fokus saat ditekan.
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => editor && aksi.jalankan(editor)}
                className={cn('w-[34px] px-0', s?.aktif && 'bg-muted text-primary')}
              >
                <Ikon aria-hidden="true" />
              </Button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function NotulensiEditor({ konten, editable, onChange, label = 'Isi notulensi' }: NotulensiEditorProps) {
  const editor = useEditor({
    extensions: EKSTENSI,
    content: konten,
    editable,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        'aria-label': label,
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-readonly': editable ? 'false' : 'true',
      },
    },
    onUpdate: ({ editor: e }) => onChange?.(e.getJSON()),
  });

  return (
    <div
      data-testid="notulensi-editor"
      className="notulensi-prosa overflow-hidden rounded-sm border border-[var(--text-tertiary)] bg-panel focus-within:border-[var(--border-focus)]"
    >
      {editable ? <Toolbar editor={editor} /> : null}
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}
